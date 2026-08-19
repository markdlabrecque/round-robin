import { INPUT_LIMITS } from '../contracts/limits.js';
import { validateRosterInput } from '../contracts/roster.js';

export const ROSTER_REPOSITORY_METHODS = Object.freeze([
  'createImport',
  'saveRoster',
  'findRosterById',
  'listRecentRosters',
  'deleteExpired',
]);

export const ROSTER_REPOSITORY_CONTRACT = Object.freeze({
  createImport: Object.freeze({
    arguments: '{ source, fingerprint, receivedAt }',
    result: '{ id, source, fingerprint, receivedAt }',
  }),
  saveRoster: Object.freeze({
    arguments: '{ importId, registrants, expiresAt }',
    result: '{ id, importId, registrants, expiresAt }',
  }),
  findRosterById: Object.freeze({ arguments: '{ id, now }', result: 'roster | null' }),
  listRecentRosters: Object.freeze({ arguments: '{ now, limit }', result: 'roster[]' }),
  deleteExpired: Object.freeze({ arguments: '{ now }', result: '{ deleted }' }),
});

function requireString(value, name) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${name} is required.`);
  return value;
}

function createImportArguments(value) {
  return {
    source: requireString(value?.source, 'source'),
    fingerprint: requireString(value?.fingerprint, 'fingerprint'),
    receivedAt: requireString(value?.receivedAt, 'receivedAt'),
  };
}

function saveRosterArguments(value) {
  return {
    importId: requireString(value?.importId, 'importId'),
    registrants: validateRosterInput({ registrants: value?.registrants }).registrants,
    expiresAt: requireString(value?.expiresAt, 'expiresAt'),
  };
}

function findRosterArguments(value) {
  return { id: requireString(value?.id, 'id'), now: requireString(value?.now, 'now') };
}

function listRecentArguments(value) {
  const limit = value?.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > INPUT_LIMITS.MAX_ROSTER_ENTRIES) {
    throw new RangeError('limit is outside the allowed range.');
  }
  return { now: requireString(value?.now, 'now'), limit };
}

function deleteExpiredArguments(value) {
  return { now: requireString(value?.now, 'now') };
}

function importResult(value) {
  const result = createImportArguments(value);
  return { id: requireString(value?.id, 'id'), ...result };
}

function rosterResult(value) {
  const result = saveRosterArguments(value);
  return { id: requireString(value?.id, 'id'), ...result };
}

function deletedResult(value) {
  if (!value || !Number.isInteger(value.deleted) || value.deleted < 0) {
    throw new TypeError('deleteExpired() must return a non-negative deleted count.');
  }
  return { deleted: value.deleted };
}

export function assertRosterRepository(repository) {
  if (!repository || typeof repository !== 'object') throw new TypeError('A roster repository is required.');
  for (const method of ROSTER_REPOSITORY_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new TypeError(`Roster repository must implement ${method}().`);
    }
  }
  return repository;
}

export function createRosterRepository(repository) {
  const implementation = assertRosterRepository(repository);
  return Object.freeze({
    async createImport(arguments_) {
      return importResult(await implementation.createImport(createImportArguments(arguments_)));
    },
    async saveRoster(arguments_) {
      return rosterResult(await implementation.saveRoster(saveRosterArguments(arguments_)));
    },
    async findRosterById(arguments_) {
      const result = await implementation.findRosterById(findRosterArguments(arguments_));
      return result === null ? null : rosterResult(result);
    },
    async listRecentRosters(arguments_) {
      const result = await implementation.listRecentRosters(listRecentArguments(arguments_));
      if (!Array.isArray(result)) throw new TypeError('listRecentRosters() must return an array.');
      return result.map(rosterResult);
    },
    async deleteExpired(arguments_) {
      return deletedResult(await implementation.deleteExpired(deleteExpiredArguments(arguments_)));
    },
  });
}
