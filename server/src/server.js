import dns2 from 'dns2';
const { UDPServer, Packet } = dns2;
import sanitizeHtml from 'sanitize-html';
import { createHash } from 'crypto';
import { createClient } from 'redis';
import { ALLOWED_MD_TAGS, CACHE_TTL, PAGE_PARTS_LIMIT, FETCH_TIMEOUT_MS } from './config.js';
import { turndown } from './turndown.js';
import { chunkText, normalizeAscii } from './util.js';

const PORT = process.env.PORT || 53;

function fetchPage(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetch(url, {
    redirect: 'follow',
    signal: controller.signal,
    headers: {
      'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    }
  }).then(res => {
    if (!res.ok) throw new Error('HTTP error ' + res.status);
    return res.text();
  }).finally(() => clearTimeout(t));
}

function renderText(html) {
  const safeHtml = sanitizeHtml(html, {
    allowedTags: ALLOWED_MD_TAGS.concat(['head', 'title']),
    allowedAttributes: { a: ['href'] },
    transformTags:{
      'head': () => ({ tagName: 'head', text: '' }),
      'title': () => ({ tagName: 'title', text: '' })
    }
  });
  return turndown.turndown(safeHtml).trim();
}

const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redis.on('error', err => console.error('[redis] error', err.message));
redis.on('connect', () => console.log('[redis] connected'));
redis.connect().catch(err => console.error('[redis] connect failed', err.message));

async function getPageChunks(url) {
  const key = 'dnsurfer:' + ':chunks:' + createHash('sha1').update(url).digest('hex');
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
  let textRaw = renderText(html).replace(/\r?\n+/g, '<r>');

  const text = normalizeAscii(textRaw);
  const chunks = chunkText(text);

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
    console.log(`[dns][query] ${new Date().toISOString()} from ${rinfo?.address || '0.0.0.0'}:${rinfo?.port || 0} name=${name}`);

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
        chunk = '<|1/1|> Page too large';
      } else if (pageNum < total) {
        const raw = chunks[pageNum];
        const prefix = `<|${pageNum + 1}/${total}|> `;
        const MAX_TXT_LEN = 255; // single TXT character-string limit
        const avail = MAX_TXT_LEN - prefix.length;
        chunk = prefix + raw.slice(0, avail);
      } else {
        console.log({chunks})
        const prefix = `<|${total}/${total}|> `;
        chunk = prefix + '<EOF>';
      }
    } catch (err) {
      chunk = `<|1/1|> Error: ${err.message}`;
      console.error('[dns][error] build response', err);
    }

    const response = Packet.createResponseFromRequest(req);
    response.answers.push({
      name,
      type: Packet.TYPE.TXT,
      class: Packet.CLASS.IN,
      ttl: 30,
      data: chunk
    });

    send(response);
    console.log(`[dns][resp] name=${name} bytes=${chunk.length} ms=${Date.now() - started}`);
  } catch (outerErr) {
    console.error('[dns][fatal]', outerErr);
    try { send(Packet.createResponseFromRequest(req)); } catch {}
  }
});

server.on('listening', () => {
  console.log(`DNS TXT server running on UDP port ${PORT}`);
});

server.listen(PORT, '0.0.0.0');