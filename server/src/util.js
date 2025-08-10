/**
 * Split a string into fixed-size chunks.
 * Useful when you need to send or encode data with length limits (e.g. DNS labels, SMS segments).
 * @param {string} text - The input text to split.
 * @param {number} [size=240] - Maximum length of each chunk (must be > 0).
 * @returns {string[]} Array of chunks in original order.
 */
export function chunkText(text, size = 240) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

/**
 * Normalize a string to plain ASCII-friendly text.
 * Replaces common Unicode punctuation with ASCII equivalents, expands some symbols,
 * collapses non‑breaking spaces to regular spaces, converts ellipsis to '...', and
 * strips remaining non-printable / non-ASCII characters (except tab, CR, LF, space–~).
 * @param {string} s - Input string possibly containing typographic Unicode characters.
 * @returns {string} Normalized ASCII-range string.
 */
export function normalizeAscii(s) {
  return s
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[·•]/g, '*')
    .replace(/[°]/g, ' deg ')
    .replace(/©/g, '(c)')
    .replace(/®/g, '(R)')
    .replace(/™/g, 'TM')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/↵/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ''); // allow tabs/newlines plus printable ASCII
}

/** * Follow a URL redirect, resolving relative paths against a base URL.
 * @param {string} base - The base URL to resolve against.
 * @param {string} loc - The location to resolve (can be absolute or relative).
 * @returns {string} Resolved absolute URL.
 */
export function followRedirect(base, loc) {
  try {
    return new URL(loc, base).toString();
  } catch {
    return loc;
  }
}
