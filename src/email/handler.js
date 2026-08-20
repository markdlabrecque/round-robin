import { persistEmailRoster } from '../contracts/email_ingestion.js';
import registrationEmailParser from '../../public/registration_email_parser.js';
import { decodeRegistrationMime, MimeError } from './mime.js';

const { parseRegistrationEmail } = registrationEmailParser;
const MAX_EMAIL_BYTES = 1024 * 1024;

class MessageTooLargeError extends Error {}

function rejectionCode(error) {
  return error instanceof MessageTooLargeError ? 'payload_too_large' : 'invalid_input';
}

async function readRaw(stream) {
  if (!stream || typeof stream.getReader !== 'function') throw new Error('Message stream is required.');
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Message stream has an invalid chunk.');
      length += value.byteLength;
      if (length > MAX_EMAIL_BYTES) throw new MessageTooLargeError();
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}

async function fingerprint(raw) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', raw);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function persistRoster(input, repository, expiresAt) {
  const roster = await persistEmailRoster(input, repository, { expiresAt });
  return { importId: roster.importId, rosterId: roster.id };
}

export function createEmailHandler({ recipient, repository, expiresAt, now = () => new Date().toISOString(), logger = console } = {}) {
  if (typeof recipient !== 'string' || !recipient || !repository || typeof expiresAt !== 'string' || !expiresAt) {
    throw new TypeError('recipient, repository, and expiresAt are required.');
  }
  const deliveries = new Map();
  const reject = (message, code) => {
    message?.setReject?.(code);
    logger?.warn?.({ event: 'email_rejected', code });
    return { status: 'rejected', error: code };
  };

  return async function handleEmail(message) {
    if (!message || message.to !== recipient) return reject(message, 'invalid_input');
    try {
      const raw = await readRaw(message.raw);
      const digest = await fingerprint(raw);
      if (deliveries.has(digest)) return deliveries.get(digest);

      const delivery = (async () => {
        const source = new TextDecoder('utf-8', { fatal: true }).decode(raw);
        const html = decodeRegistrationMime(source);
        const registrants = parseRegistrationEmail(html).map(name => ({ name }));
        const input = {
          byteLength: raw.byteLength,
          contentType: 'multipart/alternative',
          fingerprint: digest,
          receivedAt: now(),
          registrants,
        };
        const persisted = await persistRoster(input, repository, expiresAt);
        return { status: 'accepted', ...persisted };
      })();
      deliveries.set(digest, delivery);
      try {
        return await delivery;
      } catch (error) {
        deliveries.delete(digest);
        throw error;
      }
    } catch (error) {
      return reject(message, rejectionCode(error));
    }
  };
}
