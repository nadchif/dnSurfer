/**
 * Allowed HTML tags that will survive sanitation before markdown conversion.
 */
export const ALLOWED_MD_TAGS = [
  'a',
  'em',
  'i',
  'strong',
  'b',
  's',
  'del',
  'strike',
  'u',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'code',
  'pre',
  'blockquote',
  'ol',
  'ul',
  'li',
  'span',
  'div',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

/**
 * Maximum number of text chunks (pages) that can be served for a single URL.
 * Queries requesting beyond this limit will return a 'Page too large' message.
 */
export const PAGE_PARTS_LIMIT = parseInt(process.env.PAGE_PARTS_LIMIT || '150', 10);

/**
 * Cache time-to-live (seconds) for stored page chunks in Redis.
 * Higher values reduce fetch frequency; lower values increase freshness.
 */
export const CACHE_TTL = parseInt(process.env.PAGE_CACHE_TTL || '300', 10);

/**
 * Timeout in milliseconds for outbound fetch requests when retrieving pages.
 * Prevents hanging DNS responses due to slow or stalled origins.
 */
export const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '30000', 10);