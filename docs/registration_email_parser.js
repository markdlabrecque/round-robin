(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RegistrationEmailParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const STRUCTURAL_TAGS = new Set(['table', 'tr', 'td', 'th']);
  const CELL_TAGS = new Set(['td', 'th']);
  const NAMED_ENTITIES = {
    amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ',
    aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
    ccedil: 'ç', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
    iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï', ntilde: 'ñ',
    oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', oelig: 'œ',
    uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
    Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
    Ccedil: 'Ç', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
    Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï', Ntilde: 'Ñ',
    Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø', OElig: 'Œ',
    Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
  };

  function createNode(tag, parent) {
    return { tag, parent, children: [] };
  }

  function appendText(node, text) {
    if (text) node.children.push({ text });
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

  function closeImpliedTag(stack, tags) {
    for (let index = stack.length - 1; index > 0; index--) {
      if (tags.has(stack[index].tag)) {
        stack.length = index;
        return true;
      }
      if (stack[index].tag === 'table') return false;
    }
    return false;
  }

  function applyOptionalEndTagRules(stack, tag, closing) {
    if (!closing && CELL_TAGS.has(tag)) closeImpliedTag(stack, CELL_TAGS);
    if (!closing && tag === 'tr') {
      closeImpliedTag(stack, CELL_TAGS);
      closeImpliedTag(stack, new Set(['tr']));
    }
    if (closing && tag === 'tr') closeImpliedTag(stack, CELL_TAGS);
    if (closing && tag === 'table') {
      closeImpliedTag(stack, CELL_TAGS);
      closeImpliedTag(stack, new Set(['tr']));
    }
  }

  function closeTag(stack, tag) {
    let index = stack.length - 1;
    while (index > 0 && stack[index].tag !== tag) index--;
    if (index === 0) {
      if (STRUCTURAL_TAGS.has(tag)) throw new Error('Registration email is malformed HTML.');
      return;
    }
    if (STRUCTURAL_TAGS.has(tag) && stack.slice(index + 1).some(node => STRUCTURAL_TAGS.has(node.tag))) {
      throw new Error('Registration email is malformed HTML.');
    }
    stack.length = index;
  }

  function parseDocument(html) {
    const root = createNode('#document', null);
    const stack = [root];
    let position = 0;

    while (position < html.length) {
      const opening = html.indexOf('<', position);
      if (opening === -1) {
        appendText(stack.at(-1), html.slice(position));
        break;
      }
      appendText(stack.at(-1), html.slice(position, opening));

      if (html.startsWith('<!--', opening)) {
        const commentEnd = html.indexOf('-->', opening + 4);
        if (commentEnd === -1) throw new Error('Registration email is malformed HTML.');
        position = commentEnd + 3;
        continue;
      }

      const end = tagEnd(html, opening);
      if (end === -1) {
        appendText(stack.at(-1), html.slice(opening));
        break;
      }
      const source = html.slice(opening, end + 1);
      position = end + 1;
      if (/^<!|^<\?/i.test(source)) continue;

      const match = source.match(/^<\s*(\/)?\s*([a-z][\w:-]*)\b[^>]*>$/i);
      if (!match) {
        appendText(stack.at(-1), source);
        continue;
      }
      const closing = Boolean(match[1]);
      const tag = match[2].toLowerCase();
      applyOptionalEndTagRules(stack, tag, closing);
      if (closing) {
        closeTag(stack, tag);
        continue;
      }

      if (tag === 'script' || tag === 'style') {
        const closePattern = new RegExp(`<\\/\\s*${tag}\\s*>`, 'ig');
        closePattern.lastIndex = position;
        const closingMatch = closePattern.exec(html);
        if (!closingMatch) throw new Error('Registration email is malformed HTML.');
        position = closePattern.lastIndex;
        continue;
      }

      const parent = stack.at(-1);
      const node = createNode(tag, parent);
      parent.children.push(node);
      if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(source)) stack.push(node);
    }

    if (stack.slice(1).some(node => STRUCTURAL_TAGS.has(node.tag))) {
      throw new Error('Registration email is malformed HTML.');
    }
    return root;
  }

  function walk(node, visit) {
    for (const child of node.children || []) {
      if (child.tag) {
        visit(child);
        walk(child, visit);
      }
    }
  }

  function closestAncestor(node, tag) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.tag === tag) return parent;
    }
    return null;
  }

  function decodeNumericEntities(value) {
    return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, encoded) => {
      const codePoint = Number.parseInt(encoded.slice(encoded[0].toLowerCase() === 'x' ? 1 : 0), encoded[0].toLowerCase() === 'x' ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return '\ufffd';
      }
      return String.fromCodePoint(codePoint);
    });
  }

  function decodeFallbackEntities(value) {
    return decodeNumericEntities(value)
      .replace(/&([a-z][\w]+);/gi, (entity, name) => NAMED_ENTITIES[name] ?? entity);
  }

  function browserEntityDecoder() {
    const document = typeof globalThis === 'object' && globalThis.document;
    if (!document || typeof document.createElement !== 'function') return null;
    const textArea = document.createElement('textarea');
    return value => {
      textArea.innerHTML = value;
      return textArea.value;
    };
  }

  function normalizeText(value, decodeEntities) {
    return decodeEntities(value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cellText(cell, decodeEntities) {
    let value = '';
    function collect(node) {
      for (const child of node.children || []) {
        if (child.text) value += child.text;
        else if (child.tag === 'br') value += ' ';
        else if (child.tag !== 'table') collect(child);
      }
    }
    collect(cell);
    return normalizeText(value, decodeEntities);
  }

  function directRows(table) {
    const rows = [];
    walk(table, node => {
      if (node.tag === 'tr' && closestAncestor(node, 'table') === table) rows.push(node);
    });
    return rows;
  }

  function directCells(row) {
    const cells = [];
    walk(row, node => {
      if (node.tag === 'td' && closestAncestor(node, 'tr') === row) cells.push(node);
    });
    return cells;
  }

  function parseRegistrationEmail(html, options = {}) {
    if (typeof html !== 'string') throw new Error('Registration email HTML must be text.');
    const decodeEntities = typeof options.decodeEntities === 'function'
      ? options.decodeEntities
      : browserEntityDecoder() || decodeFallbackEntities;
    const document = parseDocument(html);
    const tables = [];
    walk(document, node => {
      if (node.tag === 'table') tables.push(node);
    });

    const candidates = tables.map(table => directRows(table)
      .map(directCells)
      .filter(cells => cells.length === 2)
      .map(cells => cells.map(cell => cellText(cell, decodeEntities)))
      .filter(cells => cells[0] && cells[1]));
    const strength = Math.max(0, ...candidates.map(rows => rows.length));
    if (!strength) throw new Error('No registration listing table found.');
    if (candidates.filter(rows => rows.length === strength).length > 1) {
      throw new Error('Ambiguous registration listing tables found.');
    }
    const names = candidates.find(rows => rows.length === strength)
      .map(([firstName, lastName]) => `${firstName} ${lastName}`);
    const unique = new Map();
    for (const name of names) {
      const key = name.toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, name);
    }
    return [...unique.values()];
  }

  return { parseRegistrationEmail };
});
