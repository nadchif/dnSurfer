import { JSDOM } from 'jsdom';
import { collectSvgs } from './helpers/svg.js';
import { loadStyles } from './helpers/css.js';
import { ATTRS, TAGS } from './config.js';

const nodeToCompactArray = (node) => {
  if (node.nodeType === 3) {
    const parentTag =
      node.parentNode && node.parentNode.tagName
        ? node.parentNode.tagName.toLowerCase()
        : '';
    const preserve =
      parentTag === 'pre' || parentTag === 'code' || parentTag === 'textarea';
    let text = node.textContent || '';
    if (!preserve) {
      text = text.replace(/\s+/g, ' ').trim();
    }
    return text && text.length ? text : null;
  } else if (node.nodeType === 1) {
    const tagIndex = TAGS.indexOf(node.tagName.toLowerCase());
    if (tagIndex === -1) {
      return null;
    }

    const attrs = [];
    for (let attr of node.attributes) {
      const attrIndex = ATTRS.indexOf(attr.name);
      if (attrIndex !== -1) {
        attrs.push([attrIndex, attr.value || '']);
      }
    }

    const children = [];
    for (const child of Array.from(node.childNodes)) {
      const c = nodeToCompactArray(child);
      if (Array.isArray(c) || (typeof c === 'string' && c.length)) {
        children.push(c);
      }
    }

    const compact = [tagIndex, attrs];
    if (children.length) {
      compact.push(children);
    }
    return compact;
  }
};


export const compactHtml = async (html, baseUrl) => {
  const dom = new JSDOM(html);
  let { document } = dom.window;

  const imgs = await collectSvgs(document, baseUrl);
  const styles = await loadStyles(document, baseUrl);
  // Remove style and link elements from DOM since we've extracted their content
  document
    .querySelectorAll('style, link[rel="stylesheet"]')
    .forEach((el) => el.remove());

  const out = [];

  const processNode = (node) => {
    const c = nodeToCompactArray(node);
    if (Array.isArray(c)) out.push(c);
    else if (typeof c === 'string' && c.length) out.push(c);
  };

  for (const n of document.body.childNodes) {
    processNode(n);
  }

  const bodyAttrs = {};
  const htmlAttrs = {};
  ATTRS.forEach((name) => {
    if (document.body.hasAttribute(name))
      bodyAttrs[name] = document.body.getAttribute(name);
    if (document.documentElement.hasAttribute(name))
      htmlAttrs[name] = document.documentElement.getAttribute(name);
  });

  return { dom: out, styles: styles, bodyAttrs, htmlAttrs, imgs };
}