'use strict';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

function isSpace(character) {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t' || character === '\f';
}

function tagEnd(html, start) {
  let quote = '';
  for (let index = start + 1; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

function readTag(source) {
  let position = 1;
  while (isSpace(source[position])) position++;
  const closing = source[position] === '/';
  if (closing) position++;
  while (isSpace(source[position])) position++;

  const nameStart = position;
  while (position < source.length && !isSpace(source[position]) && source[position] !== '>' && source[position] !== '/') position++;
  const tagName = source.slice(nameStart, position).toLowerCase();
  const attributes = new Map();

  while (position < source.length) {
    while (isSpace(source[position])) position++;
    if (source[position] === '>' || source[position] === '/' || position >= source.length) break;
    const attributeStart = position;
    while (position < source.length && !isSpace(source[position]) && source[position] !== '=' && source[position] !== '>' && source[position] !== '/') position++;
    const attributeName = source.slice(attributeStart, position).toLowerCase();
    while (isSpace(source[position])) position++;
    let attributeValue = '';
    if (source[position] === '=') {
      position++;
      while (isSpace(source[position])) position++;
      const quote = source[position] === '"' || source[position] === "'" ? source[position++] : '';
      const valueStart = position;
      while (position < source.length && (quote ? source[position] !== quote : !isSpace(source[position]) && source[position] !== '>')) position++;
      attributeValue = source.slice(valueStart, position);
      if (quote && source[position] === quote) position++;
    }
    if (attributeName) attributes.set(attributeName, attributeValue);
  }

  return { closing, tagName, attributes };
}

function parseHtmlDocument(html) {
  const root = { tagName: '#document', attributes: new Map(), children: [] };
  const stack = [root];
  let position = 0;

  while (position < html.length) {
    const opening = html.indexOf('<', position);
    if (opening === -1) break;
    if (html.startsWith('<!--', opening)) {
      const commentEnd = html.indexOf('-->', opening + 4);
      if (commentEnd === -1) throw new Error('Malformed HTML comment.');
      position = commentEnd + 3;
      continue;
    }
    const end = tagEnd(html, opening);
    if (end === -1) throw new Error('Malformed HTML tag.');
    const source = html.slice(opening, end + 1);
    position = end + 1;
    if (source.startsWith('<!') || source.startsWith('<?')) continue;

    const tag = readTag(source);
    if (!tag.tagName) continue;
    if (tag.closing) {
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].tagName === tag.tagName) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    const node = { tagName: tag.tagName, attributes: tag.attributes, children: [] };
    stack.at(-1).children.push(node);
    if (!VOID_TAGS.has(tag.tagName) && !source.endsWith('/>')) stack.push(node);
  }
  return root;
}

function elementsByTag(node, tagName) {
  const elements = [];
  function visit(current) {
    for (const child of current.children) {
      if (child.tagName === tagName) elements.push(child);
      visit(child);
    }
  }
  visit(node);
  return elements;
}

module.exports = { elementsByTag, parseHtmlDocument };
