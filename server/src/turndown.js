import TurndownService from 'turndown';
import { ALLOWED_MD_TAGS } from './config.js';

export const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced'
});

turndown.addRule('underline', {
  filter: ['u'],
  replacement: c => c ? '_' + c + '_' : ''
});

turndown.addRule('strikethrough', {
  filter: ['s','del','strike'],
  replacement: c => c ? '~~' + c + '~~' : ''
});

turndown.addRule('tableRow', {
  filter: 'tr',
  replacement: content => `${(content || '').trim()}<hr/>`
});

turndown.addRule('tableCell', {
  filter: 'td',
  replacement: content => `${(content || '').trim()} `
});

// Strip any disallowed element but keep its textual content
turndown.addRule('stripDisallowed', {
  filter: node => node.nodeType === 1 && !ALLOWED_MD_TAGS.includes(node.nodeName.toLowerCase()),
  replacement: content => `${content} `
});

turndown.addRule('imagePlaceholder', {
  filter: 'img',
  replacement: () => '<m>'
});