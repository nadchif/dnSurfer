/**
 * Allowed HTML tags that will survive sanitation before compact conversion.
 * Mirror the client TAGS list for parity.
 */
export const TAGS = [
  // Document structure
  'html',
  'head',
  'body',
  'title',
  'meta',
  'link',
  'style',

  // Sections
  'header',
  'footer',
  'main',
  'section',
  'article',
  'aside',
  'nav',

  // Text content
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'hr',
  'pre',
  'blockquote',

  // Inline text semantics
  'span',
  'a',
  'abbr',
  'b',
  'i',
  'u',
  'strong',
  'em',
  'small',
  'mark',
  'del',
  'ins',
  'sub',
  'sup',
  'code',
  'kbd',
  'samp',
  'var',
  'cite',
  'q',
  'time',
  'dfn',
  'bdi',
  'bdo',
  's',
  'strike',

  // Lists
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',

  // Tables
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',

  // Forms
  'form',
  'label',
  'input',
  'textarea',
  'button',
  'select',
  'option',
  'optgroup',
  'fieldset',
  'legend',
  'datalist',
  'output',
  'progress',
  'meter',

  // Media (safe subset)
  'img',
  'picture',
  'source',
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'text',

  // Other useful containers
  'div',
  'figure',
  'figcaption',
  'details',
  'summary',
  'dialog',
  'canvas',

  // Presentational tags sometimes used on legacy pages
  'center',
  'font',
];

export const ATTRS = [
  'href',
  'src',
  'alt',
  'title',
  'class',
  'id',
  'style',
  'width',
  'height',
  'rel',
  'type',
  'color',
  'bgcolor',
  'name',
  'cellpadding',
  'cellspacing',
  'colspan',
  'rowspan',
  'align',
  'valign',
  'border',
  'disabled',
  'readonly',
  'value',
  'placeholder',
  'autofocus',
  'required',
  'step',
  'checked',
  'selected',
  'multiple',
  'link',
  'text',
  'vlink',

  // Additional attributes used by SVGs
  'fill',
  'stroke',
  'viewBox',
  'xmlns',
  'version',
  'xlink:href',
  'd',
];

/**
 * Maximum number of text chunks (pages) that can be served for a single URL.
 * Queries requesting beyond this limit will return a 'Page too large' message.
 */
export const PAGE_PARTS_LIMIT = parseInt(
  process.env.PAGE_PARTS_LIMIT || '300',
  10
);

/**
 * Cache time-to-live (seconds) for stored page chunks in Redis.
 * Higher values reduce fetch frequency; lower values increase freshness.
 */
export const CACHE_TTL = parseInt(process.env.PAGE_CACHE_TTL || '300', 10);

/**
 * Timeout in milliseconds for outbound fetch requests when retrieving pages.
 * Prevents hanging DNS responses due to slow or stalled origins.
 */
export const FETCH_TIMEOUT_MS = parseInt(
  process.env.FETCH_TIMEOUT_MS || '30000',
  10
);

/**
 * Timeout in milliseconds for loading page subresources (CSS, SVG, etc.).
 * If any single resource exceeds this time to load, the server will drop the DNS request.
 */
export const RESOURCE_TIMEOUT_MS = parseInt(
  process.env.RESOURCE_TIMEOUT_MS || '15000',
  10
);

/**
 * Default max-age (seconds) applied when server responses don't include explicit
 * caching directives for CSS resources.
 */
export const DEFAULT_CSS_MAX_AGE = parseInt(
  process.env.CSS_MAX_AGE || '600',
  10
); // 10 minutes

/**
 * Default max-age (seconds) applied when server responses don't include explicit
 * caching directives for image (SVG) resources.
 */
export const DEFAULT_IMG_MAX_AGE = parseInt(
  process.env.IMG_MAX_AGE || '3600',
  10
); // 1 hour

/**
 * Maximum size (in bytes) for inlined SVG images.
 * Images larger than this will not be inlined and will remain as external links.
 */
export const MAX_INLINE_SVG_SIZE = 32 * 1024;

/**
 * Maximum number of SVG images to fetch and inline per page.
 * This prevents excessive resource loading and keeps DNS responses manageable.
 */
export const MAX_SVG_FETCH = 20;

export const SANITIZE_HTML_OPTIONS = {
  allowedTags: TAGS.concat(['head', 'title', 'style', 'link']),
  allowedAttributes: {
    a: ['href', 'rel'],
    img: ['src', 'alt'],
    link: ['rel', 'href', 'type'],
    style: [],
    '*': ATTRS,
  },
  disallowedTagsMode: 'completelyDiscard',
  transformTags: {
    input: (tagName, attribs) => ({
      tagName: 'div',
      text:
        attribs.type === 'hidden'
          ? ''
          : attribs.placeholder || attribs.value || '&nbsp;',
      attribs:
        attribs.type === 'hidden'
          ? undefined
          : {
              ...attribs,
              id: attribs.id || '',
              class:
                attribs.class +
                ' ' +
                (attribs.type === 'button' || attribs.type === 'submit'
                  ? '__chrome_button'
                  : '__chrome_input'),
              title: 'Not supported',
            },
    }),
    option: () => ({ tagName: 'span', text: '' }),
    select: () => ({ tagName: 'span', text: '' }),
    textarea: () => ({ tagName: 'span', text: '' }),
  },
};
