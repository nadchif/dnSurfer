import dns2 from 'dns2';
const { UDPServer, Packet } = dns2;
import sanitizeHtml from 'sanitize-html';
import { createHash } from 'crypto';
import {
  CACHE_TTL,
  PAGE_PARTS_LIMIT,
  FETCH_TIMEOUT_MS,
  SANITIZE_HTML_OPTIONS,
} from './config.js';
import { chunkText, compressJson } from './util.js';
import { redis } from './cache.js';
import { compactHtml } from './compact.js';

const PORT = process.env.PORT || 53;

function fetchPage(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetch(url, {
    redirect: 'follow',
    signal: controller.signal,
    headers: {
      'User-Agent':
        process.env.FETCH_UA ||
        'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    },
  })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP error ' + res.status);
      return res.text();
    })
    .finally(() => clearTimeout(t));
}

async function renderPage(html, baseUrl) {
  const safeHtml = sanitizeHtml(html, SANITIZE_HTML_OPTIONS);
  const compact = await compactHtml(safeHtml, baseUrl);
  const compressed = await compressJson(compact);
  return compressed;
}

async function getPageChunks(url) {
  const key =
    'dnsurfer:' + ':chunks:' + createHash('sha1').update(url).digest('hex');
  try {
    const cached = await redis.get(key);
    if (cached) {
      console.log('[cache] hit', key);
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[cache] get failed', e.message);
  }

  const html = await fetchPage(url);
  const textRaw = await renderPage(html, url);
  const chunks = chunkText(textRaw);

  try {
    await redis.set(key, JSON.stringify(chunks), { EX: CACHE_TTL });
  } catch (e) {
    console.warn('[cache] set failed', e.message);
  }
  return chunks;
}

const server = new UDPServer();

server.on('request', async (req, send, rinfo) => {
  const started = Date.now();
  try {
    const [question] = req.questions || [];
    const name = question ? question.name : '<no-name>';
    console.log(
      `[dns][query] ${new Date().toISOString()} from ${
        rinfo?.address || '0.0.0.0'
      }:${rinfo?.port || 0} name=${name}`
    );

    const labels = name.split('.');
    if (labels.length < 4) {
      console.warn('[dns][warn] invalid label count', labels.length, name);
      return send(Packet.createResponseFromRequest(req));
    }
    const pageLabelIndex = labels.length - 3;
    const pageNum = parseInt(labels[pageLabelIndex] || '0', 10) || 0;
    const b64Joined = labels.slice(0, pageLabelIndex).join('');

    // Allow only base64 chars
    let b64 = b64Joined.replace(/[^A-Za-z0-9+/=]/g, '');
    const padNeeded = (4 - (b64.length % 4)) % 4;
    b64 += '='.repeat(padNeeded);

    let url;
    try {
      url = Buffer.from(b64, 'base64').toString('utf8');
      if (!/^https?:\/\//i.test(url)) throw new Error('bad proto');
    } catch {
      url = 'https://news.ycombinator.com/';
    }
    console.log(`[dns][decode] url=${url} page=${pageNum}`);

    let chunk = '<|1/1|> Error';
    try {
      const chunks = await getPageChunks(url);
      const total = chunks.length;
      if (total > PAGE_PARTS_LIMIT) {
        console.warn(`[dns][limit] too many parts total=${total}`);
        chunk = `<|1/1|> ${await compressJson({
          dom: ['Page too large'],
          styles: '',
        })} `;
      } else if (pageNum < total) {
        const raw = chunks[pageNum];
        const prefix = `<|${pageNum + 1}/${total}|> `;
        const avail = 255 - prefix.length; // single TXT character-string limit is 255
        chunk = prefix + raw.slice(raw, avail);
      } else {
        const prefix = `<|${total}/${total}|> `;
        chunk = prefix + ' ';
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/abort/i.test(msg) || /timeout/i.test(msg)) {
        console.error('[dns][drop] resource timeout, dropping request');
        chunk = `<|1/1|> ${await compressJson({
          dom: ['Timeout loading page'],
          styles: '',
        })}`;
      }
      chunk = `<|1/1|> ${await compressJson({
        dom: ['Error loading page'],
        styles: '',
      })}`;
      console.error('[dns][error] build response', err);
    }

    const response = Packet.createResponseFromRequest(req);
    response.answers.push({
      name,
      type: Packet.TYPE.TXT,
      class: Packet.CLASS.IN,
      ttl: 30,
      data: chunk,
    });

    send(response);
    console.log(
      `[dns][resp] name=${name} bytes=${chunk.length} ms=${
        Date.now() - started
      }`
    );
  } catch (outerErr) {
    console.error('[dns][fatal]', outerErr);
    try {
      send(Packet.createResponseFromRequest(req));
    } catch {}
  }
});

server.on('listening', () => {
  console.log(`DNS TXT server running on UDP port ${PORT}`);
});

server.listen(PORT, '0.0.0.0');
