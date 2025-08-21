import { resourceCacheGet, resourceCacheSet } from "../cache.js";
import { DEFAULT_IMG_MAX_AGE, MAX_INLINE_SVG_SIZE, MAX_SVG_FETCH, RESOURCE_TIMEOUT_MS } from "../config.js";
import { createHash } from 'crypto';
import { parseCacheHeaders } from "../util.js";
import { JSDOM } from 'jsdom';

export const collectSvgs = async (document, baseUrl) => {
  const imgs = Array.from(document?.querySelectorAll('img[src]') || []);
  if (!imgs.length) {
    return {};
  }

  console.log(`[Server] Processing ${imgs.length} images for SVG collection`);

  // Step 1: Identify SVG candidates and collect fetch tasks
  const svgCandidates = [];
  const fetchTasks = [];

  for (const img of imgs) {
    if (svgCandidates.length >= MAX_SVG_FETCH) {
      // Stop queuing more than the configured max
      break;
    }
    const src = img.getAttribute('src') || '';
    if (!src || /^data:/i.test(src) || /^blob:/i.test(src) || /^javascript:/i.test(src)) continue;
    
    // Check if the src looks like an SVG
    const looksSvg = /\.svg(\?|#|$)/i.test(src) || /image\/svg\+xml/i.test(img.getAttribute('type') || '');
    if (!looksSvg) continue;
    
    const abs = new URL(src, baseUrl).toString();
    console.log(`[Server] Queuing SVG fetch from: ${abs}`);

    // Check if we already have this SVG queued
    if (svgCandidates.some(c => c.url === abs)) {
      console.warn(`[Server] Duplicate SVG fetch for ${abs}, skipping`);
      continue;
    }
    
    svgCandidates.push({ img, originalSrc: src, url: abs });
    
    // Create fetch task
    const fetchTask = (async () => {
      try {
        const cacheKey = 'res:svg:' + createHash('sha1').update(abs).digest('hex');
        const cachedSvg = await resourceCacheGet(cacheKey);
        if (cachedSvg && typeof cachedSvg.content === 'string') {
          return { originalSrc: src, url: abs, content: cachedSvg.content };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
          console.warn(`[Server] SVG fetch timeout for ${abs}`);
          controller.abort();
        }, RESOURCE_TIMEOUT_MS);
        
        let res;
        try {
          res = await fetch(abs, {
            signal: controller.signal,
            headers: { 
              Accept: 'image/svg+xml,text/xml,application/xml;q=0.9,*/*;q=0.1',
              'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36'
            },
            redirect: 'follow',
          });
        } finally {
          clearTimeout(timer);
        }
        
        if (!res.ok) {
          console.warn(`[Server] SVG fetch failed: ${res.status} for ${abs}`);
          return null;
        }
        
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct && !ct.includes('image/svg+xml') && !ct.includes('text/xml') && !ct.includes('application/xml')) {
          console.warn(`[Server] Invalid content-type for SVG: ${ct} from ${abs}`);
          return null;
        }
        
        const contentLen = parseInt(res.headers.get('content-length') || '0', 10);
        if (contentLen && contentLen > MAX_INLINE_SVG_SIZE) {
          console.warn(`[Server] SVG too large (${contentLen} bytes): ${abs}`);
          return null;
        }
        
  const text = await res.text();
        if (!text || text.length > MAX_INLINE_SVG_SIZE) {
          console.warn(`[Server] SVG content too large (${text.length} bytes): ${abs}`);
          return null;
        }

        console.log(`[Server] Successfully fetched SVG (${text.length} bytes) from ${abs}`);
  const ttlSec = parseCacheHeaders(res, DEFAULT_IMG_MAX_AGE);
  await resourceCacheSet(cacheKey, { content: text }, ttlSec);
  return { originalSrc: src, url: abs, content: text };
      } catch (e) {
        // Re-throw timeouts or aborts so caller can choose to drop DNS request
        if (/abort/i.test(e.message) || /timeout/i.test(e.message)) {
          console.error(`[Server] SVG fetch timeout/abort, will drop connection: ${e.message}`);
          throw e; // bubble up to signal request drop
        }
        console.warn(`[Server] Error fetching SVG from ${abs}: ${e.message}`);
        return null;
      }
    })();
    
    fetchTasks.push(fetchTask);
  }

  if (fetchTasks.length === 0) {
    return {};
  }

  console.log(`[Server] Fetching ${fetchTasks.length} SVGs in parallel`);
  const fetchResults = await Promise.all(fetchTasks);

  const svgMap = {};
  let processedCount = 0;
  
  for (const fetchResult of fetchResults) {
    if (!fetchResult || !fetchResult.url || !fetchResult.content) continue;
    
    try {
      // Validate as SVG
      let svgDom;
      try {
        svgDom = new JSDOM(fetchResult.content, { contentType: 'image/svg+xml' });
      } catch (parseError) {
        console.warn(`[Server] Failed to parse SVG from ${fetchResult.url}: ${parseError.message}`);
        continue;
      }
      
      const root = svgDom.window.document.documentElement;
      if (!root || root.tagName.toLowerCase() !== 'svg') {
        console.warn(`[Server] Invalid SVG structure from ${fetchResult.url}`);
        continue;
      }

      console.log(`[Server] Successfully validated SVG from ${fetchResult.url}`);

      // Sanitize: remove script/style, on* attrs, external urls in style attributes
      svgDom.window.document.querySelectorAll('script, style').forEach((n) => n.remove());
      svgDom.window.document.querySelectorAll('*').forEach((el) => {
        // Remove event handlers
        Array.from(el.attributes).forEach((a) => {
          if (/^on/i.test(a.name)) el.removeAttribute(a.name);
        });
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        if (/^https?:/i.test(href)) {
          el.removeAttribute('href');
          el.removeAttribute('xlink:href');
        }
        if (el.hasAttribute('style')) {
          const s = el.getAttribute('style') || '';
          const ns = s.replace(/url\s*\(([^)]+)\)/gi, '');
          el.setAttribute('style', ns);
        }
      });

      const sanitizedSvgContent = root.outerHTML;
      const mapKey = fetchResult.originalSrc;
      svgMap[mapKey] = sanitizedSvgContent;
      processedCount++;
      console.log(`[Server] Successfully processed SVG from ${fetchResult.url} as key: ${mapKey}`);
      
    } catch (e) {
      console.warn(`[Server] Error processing SVG from ${fetchResult.url}: ${e.message}`);
      // Continue with other SVGs
    }
  }

  console.log(`[Server] Successfully processed ${processedCount} out of ${svgCandidates.length} SVGs into map`);
  return svgMap;
}
