const MAX_MIME_DEPTH = 4;
const MAX_MIME_PARTS = 16;

export class MimeError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function reject(code) { throw new MimeError(code); }

function headersOf(source) {
  const match = /\r?\n\r?\n/.exec(source);
  if (!match) reject('malformed_mime');
  const lines = source.slice(0, match.index).split(/\r?\n/);
  const headers = new Map();
  for (const line of lines) {
    if (!line || /^[ \t]/.test(line)) reject('malformed_mime');
    const separator = line.indexOf(':');
    if (separator < 1 || !/^[!#$%&'*+\-.^_`|~\w]+$/.test(line.slice(0, separator))) reject('malformed_mime');
    const name = line.slice(0, separator).toLowerCase();
    if (headers.has(name)) reject('malformed_mime');
    headers.set(name, line.slice(separator + 1).trim());
  }
  return { headers, body: source.slice(match.index + match[0].length) };
}

function mediaType(value) {
  if (!value) reject('unsupported_content');
  const [type, ...parameters] = value.split(';');
  const parsed = new Map();
  for (const parameter of parameters) {
    const match = parameter.trim().match(/^([^=\s]+)=(?:"([^"\r\n]*)"|([^\s;\r\n]+))$/);
    if (!match) reject('malformed_mime');
    const name = match[1].toLowerCase();
    if (parsed.has(name)) reject('malformed_mime');
    parsed.set(name, match[2] ?? match[3]);
  }
  return { type: type.trim().toLowerCase(), parameters: parsed };
}

function decodeBody(body, headers) {
  const encoding = (headers.get('content-transfer-encoding') || '7bit').toLowerCase();
  const charset = mediaType(headers.get('content-type')).parameters.get('charset');
  if (charset && !['utf-8', 'us-ascii'].includes(charset.toLowerCase())) reject('unsupported_content');
  try {
    if (encoding === '7bit' || encoding === '8bit' || encoding === 'binary') return body;
    if (encoding === 'base64') {
      if (!/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(body) || body.replace(/\s/g, '').length % 4) reject('malformed_mime');
      const binary = atob(body.replace(/\s/g, ''));
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
    }
    if (encoding === 'quoted-printable') {
      const bytes = [];
      for (let index = 0; index < body.length; index++) {
        if (body[index] === '=') {
          if (body.slice(index + 1, index + 3) === '\r\n') { index += 2; continue; }
          if (body[index + 1] === '\n') { index++; continue; }
          const hex = body.slice(index + 1, index + 3);
          if (!/^[\da-f]{2}$/i.test(hex)) reject('malformed_mime');
          bytes.push(Number.parseInt(hex, 16));
          index += 2;
        } else {
          if (body.charCodeAt(index) > 127) reject('malformed_mime');
          bytes.push(body.charCodeAt(index));
        }
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    }
  } catch (error) {
    if (error instanceof MimeError) throw error;
  }
  reject(encoding === 'base64' || encoding === 'quoted-printable' ? 'malformed_mime' : 'unsupported_content');
}

function parseEntity(source, depth, state) {
  if (depth > MAX_MIME_DEPTH || ++state.parts > MAX_MIME_PARTS) reject('malformed_mime');
  const { headers, body } = headersOf(source);
  const contentType = mediaType(headers.get('content-type'));
  const disposition = headers.get('content-disposition');
  if (disposition && (/^attachment(?:;|$)/i.test(disposition) || /filename\s*=/i.test(disposition))) reject('attachment');
  if (contentType.parameters.has('name')) reject('attachment');
  if (!contentType.type.startsWith('multipart/')) {
    if (!['text/html', 'text/plain'].includes(contentType.type)) reject('unsupported_content');
    return [{ type: contentType.type, body: decodeBody(body, headers) }];
  }
  if (!['multipart/alternative', 'multipart/mixed'].includes(contentType.type)) reject('unsupported_content');
  const boundary = contentType.parameters.get('boundary');
  if (!boundary || boundary.length > 70 || /[\r\n]/.test(boundary)) reject('malformed_mime');
  const lines = body.split(/\r?\n/);
  const marker = `--${boundary}`;
  const closing = `${marker}--`;
  const parts = [];
  let current = null;
  let ended = false;
  for (const line of lines) {
    if (line === marker || line === closing) {
      if (ended) reject('malformed_mime');
      if (current !== null) parts.push(current.join('\r\n'));
      current = line === closing ? null : [];
      if (line === closing) ended = true;
    } else if (current) {
      current.push(line);
    } else if (ended && line.trim()) {
      reject('malformed_mime');
    }
  }
  if (!ended || !parts.length || current !== null) reject('malformed_mime');
  return parts.flatMap(part => parseEntity(part, depth + 1, state));
}

export function decodeRegistrationMime(source) {
  const leaves = parseEntity(source, 0, { parts: 0 });
  const html = leaves.filter(leaf => leaf.type === 'text/html');
  if (html.length !== 1) reject('unsupported_content');
  return html[0].body;
}
