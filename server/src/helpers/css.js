import { PurgeCSS } from 'purgecss';
import CleanCSS from 'clean-css';
import { createHash } from 'crypto';
import fs from 'fs';
import { resourceCacheGet, resourceCacheSet } from '../cache.js';
import { DEFAULT_CSS_MAX_AGE, RESOURCE_TIMEOUT_MS } from '../config.js';
import { parseCacheHeaders } from '../util.js';

const purger = new PurgeCSS();
export const purgeCss = async (html, css) => {
  const result = await purger.purge({
    content: [{ raw: html, extension: 'html' }],
    css: [{ raw: css, extension: 'css' }],
  });
  return result[0].css || '';
};

const cssMinifier = new CleanCSS();
export const minifyCss = (css) => cssMinifier.minify(css).styles || '';

async function fetchCssContent(url, baseUrl) {
  try {
    const absoluteUrl = new URL(url, baseUrl).toString();
    console.log(`[Server] Fetching CSS from: ${absoluteUrl}`);
    const cacheKey =
      'res:css:' + createHash('sha1').update(absoluteUrl).digest('hex');
    const cached = await resourceCacheGet(cacheKey);
    if (cached && typeof cached.text === 'string') {
      return cached.text;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn(`[Server] CSS fetch timeout for ${absoluteUrl}`);
      controller.abort();
    }, RESOURCE_TIMEOUT_MS);

    const response = await fetch(absoluteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          process.env.FETCH_UA ||
          'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36',
        Accept: 'text/css,*/*;q=0.1',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const msg = `[Server] CSS fetch failed: ${response.status} for ${absoluteUrl}`;
      console.warn(msg);
      // Throw to allow upstream to decide to drop request
      throw new Error(msg);
    }

    const cssText = await response.text();
    const ttlSec = parseCacheHeaders(response, DEFAULT_CSS_MAX_AGE);
    console.log(
      `[Server] Successfully fetched ${cssText.length} chars of CSS from ${absoluteUrl}`
    );

    // TODO: add support for @import statements in the CSS

    await resourceCacheSet(cacheKey, { text: cssText }, ttlSec);
    return cssText;
  } catch (error) {
    console.warn(`[Server] Error fetching CSS from ${url}:`, error.message);
    return `/* Error loading CSS from ${url}: ${error.message} */`;
  }
}

export const loadStyles = async (document, baseUrl) => {
  const rules = new Set();

  document?.querySelectorAll('style').forEach((styleEl) => {
    if (styleEl.textContent && styleEl.textContent.trim()) {
      rules.add(styleEl.textContent.trim());
    }
  });

  const linkElements = document?.querySelectorAll('link[rel="stylesheet"]');
  const cssPromises = Array.from(linkElements).map(async (linkEl) => {
    const href = linkEl.getAttribute('href');
    if (href) {
      const cssContent = await fetchCssContent(href, baseUrl);
      return cssContent;
    }
    return null;
  });

  const externalCssResults = await Promise.all(cssPromises);
  externalCssResults.forEach((css) => {
    if (css) {
      rules.add(css);
    }
  });

  const combinedStyles = Array.from(rules).join('\n');

  let htmlSnapshot = '';
  try {
    const cloned = document.body.cloneNode(true);
    cloned.querySelectorAll('script, style, link').forEach((n) => n.remove());
    htmlSnapshot = cloned.outerHTML || '';
  } catch {
    htmlSnapshot = document.body ? document.body.outerHTML || '' : '';
  }

  let purgedCss = combinedStyles;
  try {
    if (combinedStyles && combinedStyles.trim()) {
      purgedCss = await purgeCss(htmlSnapshot, combinedStyles);
    }
  } catch (err) {
    console.warn('[Server] PurgeCSS failed, using unpurged CSS:', err.message);
  }
  fs.writeFileSync('raw.log', combinedStyles, 'utf8');
  const minifiedCss = minifyCss(purgedCss);
  fs.writeFileSync('optimized.log', minifiedCss, 'utf8');

  return minifiedCss;
};
