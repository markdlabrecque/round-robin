import { INPUT_LIMITS } from './limits.js';

export const ROSTER_API_VERSION = 1;
export const ROSTER_JSON_SHAPE = Object.freeze({
  version: ROSTER_API_VERSION,
  roster: '{ id, registrants, createdAt, expiresAt }',
});
export const IMPORT_JSON_SHAPE = Object.freeze({
  version: ROSTER_API_VERSION,
  import: '{ id, rosterId, source, receivedAt }',
});

export function validateRegistrantName(value) {
  if (typeof value !== 'string') throw new TypeError('Registrant name must be a string.');
  const name = value.trim();
  if (!name || name.length > INPUT_LIMITS.MAX_PLAYER_NAME_LENGTH) {
    throw new RangeError('Registrant name is outside the allowed length.');
  }
  return name;
}

export function validateRosterInput(value) {
  if (!value || !Array.isArray(value.registrants) || value.registrants.length > INPUT_LIMITS.MAX_ROSTER_ENTRIES) {
    throw new RangeError('Roster registrants are invalid or exceed the limit.');
  }
  const seen = new Set();
  const registrants = value.registrants.map(registrant => {
    const name = validateRegistrantName(registrant && registrant.name);
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) throw new RangeError('Roster registrants must be unique.');
    seen.add(key);
    return { ...(registrant.id ? { id: String(registrant.id) } : {}), name };
  });
  return { registrants };
}

function requireRecord(record, name) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) {
    throw new TypeError(`${name} must include a non-empty id.`);
  }
  return record;
}

function requireTimestamp(record, field, name) {
  if (typeof record[field] !== 'string' || !record[field]) {
    throw new TypeError(`${name} must include ${field}.`);
  }
}

export function rosterEnvelope(roster) {
  const record = requireRecord(roster, 'Roster');
  requireTimestamp(record, 'createdAt', 'Roster');
  requireTimestamp(record, 'expiresAt', 'Roster');
  const { registrants } = validateRosterInput(record);
  return { version: ROSTER_API_VERSION, roster: { ...record, registrants } };
}

export function importEnvelope(importRecord) {
  const record = requireRecord(importRecord, 'Import');
  if (typeof record.rosterId !== 'string' || !record.rosterId || typeof record.source !== 'string' || !record.source) {
    throw new TypeError('Import must include rosterId and source.');
  }
  requireTimestamp(record, 'receivedAt', 'Import');
  return { version: ROSTER_API_VERSION, import: { ...record } };
}
