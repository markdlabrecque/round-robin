import { INPUT_LIMITS, RETENTION } from './limits.js';
import { validateRosterInput } from './roster.js';
import { createRosterRepository } from '../repositories/roster_repository.js';

export const EMAIL_INGESTION_BOUNDARY = Object.freeze({
  acceptedContentTypes: Object.freeze(['text/plain', 'text/html', 'multipart/alternative', 'multipart/mixed']),
  persistence: 'validated roster data is persisted only through a roster repository',
  rawMessageRetention: 'never persist raw message content',
});

export function validateEmailIngestion(input) {
  if (!input || typeof input !== 'object' || !Number.isInteger(input.byteLength) || input.byteLength < 0 || input.byteLength > INPUT_LIMITS.MAX_EMAIL_BYTES) {
    throw new RangeError('Email size is invalid or exceeds the limit.');
  }
  if (!EMAIL_INGESTION_BOUNDARY.acceptedContentTypes.includes(input.contentType)) {
    throw new TypeError('Email content type is not accepted.');
  }
  if (typeof input.fingerprint !== 'string' || !input.fingerprint || typeof input.receivedAt !== 'string' || !input.receivedAt) {
    throw new TypeError('Email fingerprint and receivedAt are required.');
  }
  return {
    fingerprint: input.fingerprint,
    receivedAt: input.receivedAt,
    ...validateRosterInput({ registrants: input.registrants }),
  };
}

export async function persistEmailRoster(input, repository, { expiresAt } = {}) {
  const email = validateEmailIngestion(input);
  const rosterRepository = createRosterRepository(repository);
  if (typeof expiresAt !== 'string' || !expiresAt) {
    throw new TypeError(`expiresAt is required; apply the ${RETENTION.ROSTER_DAYS}-day retention policy before persistence.`);
  }
  const importRecord = await rosterRepository.createImport({
    source: 'email',
    fingerprint: email.fingerprint,
    receivedAt: email.receivedAt,
  });
  if (!importRecord || typeof importRecord.id !== 'string' || !importRecord.id) {
    throw new TypeError('Roster repository createImport() must return an import id.');
  }
  return rosterRepository.saveRoster({
    importId: importRecord.id,
    registrants: email.registrants,
    expiresAt,
  });
}
