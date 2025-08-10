import { pageCache } from './cache.js';
import { browsingHistory } from './history.js';

export const MAX_PARALLEL_DNS_REQUESTS = 3;

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
  output.innerHTML = `<div>
    <h2>Favorites</h2>
    <div class="favorites-container">
      <button class="favBtn" style="background:#b31b1b;color:#fff" data-url="https://arxiv.org/" title="arXiv - Academic Papers">arxiv.org</button>
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

  output.innerHTML = `<pre>Loading...</pre>`;

  try {
    const firstTxt = await window.dnsApi.fetchPage(currentUrl, currentPage);
    const parsed = parseFragment(firstTxt);
    const firstIndex = parsed.index; // 1-based index of this fragment
    const total = parsed.total;
    const firstText = parsed.text;

    if (total <= 1) {
      // Single fragment - cache and render immediately
      pageCache.set(currentUrl, firstText);
      renderAndAttach(firstText);
      return;
    }

    output.innerHTML = `<pre>(${Math.round(100 / total)}%) Loading...</pre>`;
    const requiredIndices = [];
    for (let j = 1; j <= total; j++)
      if (j !== firstIndex) requiredIndices.push(j);
    const fragments = new Array(total + 1);
    const received = new Set([firstIndex]);
    fragments[firstIndex] = firstText;
    let completedChunks = 1;

    function updateProgress() {
      const progressPercent = Math.round((completedChunks / total) * 100);
      output.innerHTML = `<pre>(${progressPercent}%) Loading...</pre>`;
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

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
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
          fragments[j] = `\n[Missing fragment ${j}: index mismatch]\n`;
        } else {
          fragments[j] = p.text;
          received.add(j);
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.warn('[UI] fragment', j, 'failed:', msg);
        fragments[j] = `\n[Missing fragment ${j}: ${msg}]\n`;
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
        fragments[j] = `\n[Missing fragment ${j} (no data)]\n`;
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

function renderAndAttach(mdText) { 
  mdText = mdText.replace(/<r\s*>/gi, '\r\n\r\n');
  mdText = mdText.replace(/<m\s*>/gi, '[IMG]');
  mdText = sanitizeMarkdownLinkUrls(mdText);
  output.innerHTML = (window.marked?.parse ? window.marked.parse(mdText) : mdText);
  attachLinkHandlers();
}

// Remove stray newlines / whitespace inside link destinations: [text](https://exa\n mple.com)
// and autolinks: <https://exa\n mple.com>
function sanitizeMarkdownLinkUrls(src) {
  src = src.replace(/\[\s*\]\s*\([^)]*\)/g, '');
  src = src.replace(/\[([^\]]+)\]\s*\(([^)]+)\)/g, (full, text, url) => {
    const cleanedUrl = url.replace(/\s+/g, ''); // remove all whitespace from URL
    const cleanedText = text.replace(/\s+/g, ' ').trim(); // collapse internal whitespace/newlines
    return `[${cleanedText}](${cleanedUrl})`;
  });
  // Autolinks
  src = src.replace(
    /<(https?:[^>]+)>/g,
    (full, url) => `<${url.replace(/\s+/g, '')}>`
  );
  return src;
}

function attachLinkHandlers() {
  const links = output.querySelectorAll('a');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      // external link: navigate within the app
      link.addEventListener('click', (e) => {
        e.preventDefault();
        setCurrentUrl(href);
        currentPage = 0;
        loadPage();
      });
    } else if (href.startsWith('#')) {
      // fragment link: scroll to element id if exists
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = href.slice(1);
        const el = document.getElementById(id);
        if (el) el.scrollIntoView();
      });
    } else {
      // relative link or other scheme: treat as path relative to currentUrl
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const base = currentUrl || '';
        try {
          const real = new URL(href, base).toString();
          setCurrentUrl(real);
          currentPage = 0;
          loadPage();
        } catch {
          console.warn('Could not resolve link href:', href);
        }
      });
    }
  });
}
