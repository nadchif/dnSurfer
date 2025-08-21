import JsonUrl from 'json-url';

/**
 * Split a string into fixed-size chunks.
 * Useful when you need to send or encode data with length limits (e.g. DNS labels, SMS segments).
 * @param {string} text - The input text to split.
 * @param {number} [size=240] - Maximum length of each chunk (must be > 0).
 * @returns {string[]} Array of chunks in original order.
 */
export function chunkText(text, size = 240) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size)
    chunks.push(text.slice(i, i + size));
  return chunks;
}

/**
 * Compress a JSON object using LZMA compression and encode it as a URL-safe string.
 * Uses json-url library for compression.
 * @param {Object} obj - The JSON object to compress.
 * @returns {Promise<string>} The compressed and encoded string.
 */
const jsonCodec = JsonUrl('lzma');
export const compressJson = async (obj) => {
  const encoded = await jsonCodec.compress(obj);
  return encoded;
};


/**
 * Parse cache headers from a Response object to determine how long to cache the response.
 * Fallback to a default value if no cache headers are present.
 * @param {Response} res - The Response object to parse.
 * @param {number} fallbackSeconds - Default cache duration in seconds if no headers are found.
 * @returns {number} The determined cache duration in seconds.
 */
export const parseCacheHeaders = (res, fallbackSeconds)  =>{
  let ttlSec = fallbackSeconds;
  try {
    const cacheControl = res.headers.get('cache-control') || '';
    const cc = cacheControl.toLowerCase();
    const noStore = /no-store|private/i.test(cc);
    if (noStore) return 0; // don't cache
    const m = cc.match(/max-age=(\d+)/);
    if (m) ttlSec = parseInt(m[1], 10);
    else {
      const expires = res.headers.get('expires');
      if (expires) {
        const exp = Date.parse(expires);
        if (!isNaN(exp)) {
          const diff = Math.floor((exp - Date.now()) / 1000);
          if (diff > 0) ttlSec = diff;
        }
      }
    }
  } catch {}
  return ttlSec;
}