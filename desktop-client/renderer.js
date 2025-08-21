import { pageCache } from './cache.js';
import { ATTRS, TAGS } from './config.js';
import { browsingHistory } from './history.js';
import './json-url.js';
const jsonCodec = window.JsonUrl('lzma');

export const MAX_PARALLEL_DNS_REQUESTS = 3;

const PLACEHOLDER_IMG = `<svg xmlns='http://www.w3.org/2000/svg' width='2' height='1'><rect width='2' height='1' fill='#808080'/></svg>`;
const PLACEHOLDER_IMG_DATA_URL =
  'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(PLACEHOLDER_IMG);

const getPlaceholderImg = (alt) => {
  if (!alt || !alt.trim()) {
    return PLACEHOLDER_IMG_DATA_URL;
  }
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
        <rect width='100%' height='100%' fill='#888'/>
        <text 
          x='2%' 
          y='50%' 
          font-size='16' 
          text-anchor='start' 
          dominant-baseline='middle' 
          fill='#fff'
        >
          ${alt}
        </text>
      </svg>
    `)
  );
};

const renderLoadingPage = (percent) =>
  `<div style="padding:1rem; position:">${
    percent ? '(' + percent + '%) ' : ' '
  }Loading<span class="loader"></span></div>`;

function getSearchUrl(queryText) {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(queryText)}`;
}

const form = document.getElementById('queryForm');
const output = document.getElementById('output');
const forwardBtn = document.getElementById('nextBtn');
const backBtn = document.getElementById('prevBtn');
const homeBtn = document.getElementById('homeBtn');
const githubBtn = document.getElementById('githubBtn');
const urlEl = document.getElementById('url');

function resetUrlInputStyling() {
  if (urlEl) {
    urlEl.style.color = '';
    urlEl.style.fontWeight = '';
    urlEl.title = '';
  }
}

let currentUrl = '';

function updateHistoryButtons() {
  if (backBtn) backBtn.disabled = !browsingHistory.canGoBack();
  if (forwardBtn) forwardBtn.disabled = !browsingHistory.canGoForward();
}

// helper to set and sync currentUrl to the input box, optionally push to history
function setCurrentUrl(u, push = true) {
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }

  if (push) {
    browsingHistory.push(u);
  }

  currentUrl = u;
  if (urlEl && urlEl.value !== u) urlEl.value = u;
  updateHistoryButtons();
}

let currentPage = 0;

// Handle URL input submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = urlEl.value.trim();
  if (!raw) return;
  let finalUrl;
  if (/^https?:\/\//i.test(raw)) {
    finalUrl = raw;
  } else if (!/\s/.test(raw)) {
    finalUrl = 'https://' + raw;
  } else {
    finalUrl = getSearchUrl(raw);
  }
  setCurrentUrl(finalUrl, true);
  currentPage = 0;
  await loadPage();
});

if (backBtn)
  backBtn.addEventListener('click', async () => {
    const url = browsingHistory.goBack();
    if (url) {
      setCurrentUrl(url, false);
      currentPage = 0;
      await loadPage();
    }
  });

if (forwardBtn)
  forwardBtn.addEventListener('click', async () => {
    const url = browsingHistory.goForward();
    if (url) {
      setCurrentUrl(url, false);
      currentPage = 0;
      await loadPage();
    }
  });

// Handle favorite button clicks
function attachFavoriteHandlers() {
  const favBtns = document.querySelectorAll('.favBtn');
  favBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = btn.getAttribute('data-url');
      if (url) {
        setCurrentUrl(url, true);
        currentPage = 0;
        loadPage();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderHome();

  // Listen for navigation requests intercepted by main process
  if (window.dnsApi && window.dnsApi.onLoadOverDns) {
    window.dnsApi.onLoadOverDns((event, data) => {
      if (data && data.url) {
        console.log('[UI] Received loadOverDns request for:', data.url);
        setCurrentUrl(data.url, true);
        currentPage = 0;
        loadPage();
      }
    });
  }
});

if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    currentUrl = '';
    if (urlEl) urlEl.value = '';
    resetUrlInputStyling();
    renderHome();
  });
}

if (githubBtn) {
  githubBtn.addEventListener('click', () => {
    window.dnsApi.openExternal('https://github.com/nadchif/dnSurfer');
  });
}

function renderHome() {
  output.innerHTML = `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
    <h2>Favorites</h2>
    <div class="favorites-container">
      <button class="favBtn" style="background:#b31b1b;color:#fff" data-url="https://arxiv.org/" title="arXiv - Academic Papers">arxiv.org</button>
      <button class="favBtn" style="background:#fafafa;color:#000" data-url="https://bearblog.dev/discover/" title="YouTube - Video Platform">ʕ•ᴥ•ʔ Bear</button>
      <button class="favBtn" style="background:#000;color:#fff" data-url="https://dev.to" title="Dev.to - Developer Community">DEV</button>
      <button class="favBtn" style="background:#ff6600;color:#fff" data-url="https://news.ycombinator.com" title="Hacker News">Hacker News</button>
    </div>
  </div>`;
  attachFavoriteHandlers();
  updateHistoryButtons();
}

async function loadPage() {
  if (!window.dnsApi || !window.dnsApi.fetchPage) {
    console.error('[UI] dnsApi missing');
    output.innerHTML = '<pre>dnsApi not available (preload failed)</pre>';
    return;
  }

  console.log(
    '[UI] loadPage currentUrl=%s currentPage=%d',
    currentUrl,
    currentPage
  );

  // Check cache first
  const cachedContent = pageCache.get(currentUrl);
  if (cachedContent) {
    console.log('[UI] Serving from cache');
    if (urlEl) {
      urlEl.style.color = '#155724';
      urlEl.title = 'Content served from cache';
    }
    renderAndAttach(cachedContent);
    return;
  }

  resetUrlInputStyling();

  output.innerHTML = renderLoadingPage(0);

  try {
    const firstTxt = await window.dnsApi.fetchPage(currentUrl, currentPage);
    const parsed = parseFragment(firstTxt);
    const firstIndex = parsed.index;
    const total = parsed.total;
    const firstText = parsed.text;

    if (total <= 1) {
      if (firstText.trim().length > 200) {
        // Single fragment - cache and render immediately
        pageCache.set(currentUrl, firstText);
      }
      renderAndAttach(firstText);
      return;
    }

    output.innerHTML = renderLoadingPage(Math.floor(100 / total));
    const requiredIndices = [];
    for (let j = 1; j <= total; j++)
      if (j !== firstIndex) requiredIndices.push(j);
    const fragments = new Array(total + 1);
    const received = new Set([firstIndex]);
    fragments[firstIndex] = firstText;
    let completedChunks = 1;

    function updateProgress() {
      const progressPercent = Math.round((completedChunks / total) * 100);
      output.innerHTML = renderLoadingPage(progressPercent);
    }
    updateProgress();

    async function asyncPool(poolLimit, array, iteratorFn) {
      const ret = [];
      const executing = new Set();
      for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        if (executing.size >= poolLimit) {
          await Promise.race(executing);
        }
      }
      return Promise.all(ret);
    }

    function fetchWithTimeout(pageNum, attempt) {
      return window.dnsApi.fetchPage(currentUrl, pageNum);
    }

    async function fetchFragmentIndex(j) {
      const pageNum = j - 1;
      try {
        const txt = await fetchWithTimeout(pageNum, 1);
        const p = parseFragment(txt);
        if (p.index !== j) {
          console.warn(
            '[UI] Index mismatch headerIndex=%d expected=%d totalHeader=%d',
            p.index,
            j,
            p.total
          );
        } else {
          fragments[j] = p.text;
          received.add(j);
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.warn('[UI] fragment', j, 'failed:', msg);
      }
      completedChunks++;
      updateProgress();
    }

    await asyncPool(
      MAX_PARALLEL_DNS_REQUESTS,
      requiredIndices,
      fetchFragmentIndex
    );

    // After pool completes, ensure every slot filled
    for (let j = 1; j <= total; j++) {
      if (!fragments[j]) {
        console.warn('[UI] Filling missing fragment', j);
      }
    }

    // Assemble final content
    let allText = '';
    for (let j = 1; j <= total; j++) allText += fragments[j] || '';

    pageCache.set(currentUrl, allText);
    renderAndAttach(allText);
  } catch (err) {
    console.error('[UI] loadPage error', err);
    output.innerHTML = `<pre>Error ${err}</pre>`;
  }
}

function parseFragment(txt) {
  // match header like <|2/27|> maybe followed by space
  const headerRe = /^\s*<\|(\d+)\/(\d+)\|\>\s*(.*)$/s;
  const m = txt.match(headerRe);
  if (!m) {
    console.log('[UI] parseFragment fallback single fragment');
    return { index: 1, total: 1, text: txt };
  }
  const index = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  const text = m[3] || '';
  return { index, total, text };
}

function compactToHtml(node) {
  if (Array.isArray(node) && typeof node[0] !== 'number') {
    return node.map(compactToHtml).join('');
  }
  if (typeof node === 'string') return node;

  const [tagIndex, attrs, children = []] = node;
  const tag = TAGS[tagIndex];

  const attrString = attrs.map(([k, v]) => ` ${ATTRS[k]}="${v}"`).join('');

  const childHtml = children.map(compactToHtml).join('');
  return ` <${tag}${attrString}>${childHtml}</${tag}> `;
}

async function renderAndAttach(payloadText) {
  output.innerHTML = '';

  const payload = await jsonCodec.decompress(payloadText);
  console.log('[UI] Render payload:', payload);
  const imgMap = payload.imgs || {};

  // Render the DOM string once
  const html = compactToHtml(payload.dom);
  const baseHref = currentUrl || '';
  const safeStyles =
    payload.styles && payload.styles?.trim()
      ? payload.styles.replace(/@import[^;]+;/gi, '')
      : '';
  const stylesForIframe = safeStyles
    ? safeStyles.replace(/url\s*\(([^)]+)\)/gi, (m, p1) => {
        const val = String(p1 || '')
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (val.startsWith('data:')) return m;
        return `url(${PLACEHOLDER_IMG_DATA_URL})`;
      })
    : '';
  let htmlForIframe = html;

  htmlForIframe = htmlForIframe
    .replace(/style\s*=\s*"([^"]*)"/gi, (full, content) => {
      const ns = content.replace(
        /url\s*\(([^)]+)\)/gi,
        `url(${PLACEHOLDER_IMG_DATA_URL})`
      );
      return `style="${ns}"`;
    })
    .replace(/style\s*=\s*'([^']*)'/gi, (full, content) => {
      const ns = content.replace(
        /url\s*\(([^)]+)\)/gi,
        `url(${PLACEHOLDER_IMG_DATA_URL})`
      );
      return `style='${ns}'`;
    });

  function sanitizeIframeContent(htmlInput) {
    const container = document.createElement('div');
    container.innerHTML = htmlInput;
    try {
      container.querySelectorAll('script').forEach((s) => s.remove());
    } catch {}
    try {
      container
        .querySelectorAll(
          'link[rel="stylesheet"], link[rel~="icon"], link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"], link[rel="dns-prefetch"]'
        )
        .forEach((l) => l.remove());
    } catch {}
    try {
      container.querySelectorAll('*').forEach((el) => {
        for (let i = el.attributes.length - 1; i >= 0; i--) {
          const a = el.attributes[i];
          if (/^on/i.test(a.name)) el.removeAttribute(a.name);
        }
      });
    } catch {}
    try {
      const getImgSrc = (src, alt = '') => {
        console.log('[UI] getImgSrc called for:', src, imgMap);
        if (!src || !imgMap || typeof imgMap !== 'object')
          return PLACEHOLDER_IMG_DATA_URL;
        const imgContent = imgMap[src];
        if (!imgContent) {
          return getPlaceholderImg(alt);
        }
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
          imgContent
        )}`;
      };
      container.querySelectorAll('img').forEach((img) => {
        const currentSrc = img.getAttribute('src');
        if (img.hasAttribute('src') && !/^data:/i.test(currentSrc)) {
          img.setAttribute('src', getImgSrc(currentSrc, img.alt));
        }
        img.removeAttribute('srcset');
        img.removeAttribute('data-src');
      });
    } catch {}
    try {
      container.querySelectorAll('[style]').forEach((el) => {
        const s = el.getAttribute('style');
        if (!s) return;
        const ns = s.replace(
          /url\s*\(([^)]+)\)/gi,
          `url(${PLACEHOLDER_IMG_DATA_URL})`
        );
        el.setAttribute('style', ns);
      });
    } catch {}
    try {
      container.querySelectorAll('style').forEach((st) => {
        st.textContent = (st.textContent || '').replace(/@import[^;]+;/gi, '');
      });
    } catch {}
    try {
      const mappings = [
        ['bgcolor', 'backgroundColor'],
        ['color', 'color'],
        ['width', 'width', (v) => (/^\d+$/.test(v) ? v + 'px' : v)],
        ['height', 'height', (v) => (/^\d+$/.test(v) ? v + 'px' : v)],
        ['align', 'textAlign'],
        ['valign', 'verticalAlign'],
        ['border', 'borderWidth', (v) => (/^\d+$/.test(v) ? v + 'px' : v)],
        ['cellpadding', 'padding', (v) => (/^\d+$/.test(v) ? v + 'px' : v)],
      ];
      mappings.forEach(([attr, prop, transform]) => {
        container.querySelectorAll('[' + attr + ']').forEach((el) => {
          const raw = el.getAttribute(attr);
          if (!raw) return;
          const val = transform ? transform(raw) : raw;
          try {
            el.style[prop] = val;
          } catch {}
        });
      });
    } catch {}
    try {
      container.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
        button.style.cursor = 'not-allowed';
        button.style.pointerEvents = 'none';
      });
    } catch {}
    return container.innerHTML;
  }

  const sanitizedHtml = sanitizeIframeContent(htmlForIframe);

  let finalHtml = sanitizedHtml;

  const csp = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "manifest-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "prefetch-src 'none'",
    "navigate-to 'none'",
  ].join('; ');

  const iframeDoc = `<!doctype html><html${attrsFromMap(
    payload.htmlAttrs
  )}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base href="${escapeHtmlAttr(
    baseHref
  )}"><style>
  .__chrome_input {
    display: inline-flex;
    align-items: center; 
    width: 20ch;
    min-width: 0;
    padding: 1px 2px;
    border: 2px inset #eee;
    background-color: white;
    font: 400 13.3333px Arial;
    color: initial;
    text-align: left;
    cursor: not-allowed;
    height: 2em;              
    line-height: 2em; 
  }
  .__chrome_button {
    display: inline-flex;
    align-items: center; 
    padding: 1px 6px;
    border: 2px outset buttonborder;
    background-color: buttonface;
    color: buttontext;
    font: 400 13.3333px Arial; /* Chrome's default system font size */
    height: 2em;              
    line-height: 2em; 
    text-align: center;
    cursor: not-allowed;
  }
  ${stylesForIframe}
  </style></head><body${attrsFromMap(
    payload.bodyAttrs
  )}>${finalHtml}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', '');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.width = '100vw';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.srcdoc = iframeDoc;
  output.appendChild(iframe);

  try {
    const styledEls = output.querySelectorAll('[style]');
    styledEls.forEach((el) => {
      const s = el.getAttribute('style');
      if (s && /url\s*\(/i.test(s)) {
        const newStyle = s.replace(
          /url\s*\(([^)]+)\)/gi,
          `url(${PLACEHOLDER_IMG_DATA_URL})`
        );
        el.setAttribute('style', newStyle);
      }
    });
  } catch (err) {
    console.warn('[UI] Failed to replace images with placeholders', err);
  }
}

// Helpers used for iframe srcdoc assembly
function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attrsFromMap(map) {
  try {
    if (!map || typeof map !== 'object') return '';
    const parts = [];
    Object.entries(map).forEach(([k, v]) => {
      if (v == null || v === '') return;
      parts.push(' ' + k + '="' + escapeHtmlAttr(String(v)) + '"');
    });
    return parts.join('');
  } catch {
    return '';
  }
}
