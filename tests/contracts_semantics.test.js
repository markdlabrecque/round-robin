'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const source = relative => import(`${pathToFileURL(path.join(__dirname, '..', 'src', relative)).href}?test=${Date.now()}`);

test('roster and import responses use versioned plain JSON envelopes', async () => {
  const { ROSTER_API_VERSION, rosterEnvelope, importEnvelope } = await source('contracts/roster.js');
  const roster = rosterEnvelope({
    id: 'roster-1',
    registrants: [{ id: 'player-1', name: ' Ada Lovelace ' }],
    createdAt: '2026-08-19T00:00:00.000Z',
    expiresAt: '2026-09-18T00:00:00.000Z',
  });

  assert.deepEqual(roster, {
    version: ROSTER_API_VERSION,
    roster: {
      id: 'roster-1',
      registrants: [{ id: 'player-1', name: 'Ada Lovelace' }],
      createdAt: '2026-08-19T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
    },
  });
  assert.deepEqual(importEnvelope({
    id: 'import-1', rosterId: 'roster-1', source: 'email', receivedAt: '2026-08-19T00:00:00.000Z',
  }), {
    version: ROSTER_API_VERSION,
    import: { id: 'import-1', rosterId: 'roster-1', source: 'email', receivedAt: '2026-08-19T00:00:00.000Z' },
  });
});

test('roster and import envelopes reject missing identity and timestamp fields', async () => {
  const { rosterEnvelope, importEnvelope } = await source('contracts/roster.js');
  assert.throws(() => rosterEnvelope({ id: 'roster-1', registrants: [], expiresAt: '2026-09-18T00:00:00.000Z' }), /createdAt/);
  assert.throws(() => rosterEnvelope({ id: 'roster-1', registrants: [], createdAt: '2026-08-19T00:00:00.000Z' }), /expiresAt/);
  assert.throws(() => importEnvelope({ id: 'import-1', rosterId: 'roster-1', source: 'email' }), /receivedAt/);
  assert.throws(() => importEnvelope({ rosterId: 'roster-1', source: 'email', receivedAt: '2026-08-19T00:00:00.000Z' }), /id/);
});

test('repository adapter validates every operation argument and result shape', async () => {
  const { createRosterRepository } = await source('repositories/roster_repository.js');
  const calls = [];
  const repository = createRosterRepository({
    async createImport(argument) { calls.push(['createImport', argument]); return { id: 'import-1', ...argument }; },
    async saveRoster(argument) { calls.push(['saveRoster', argument]); return { id: 'roster-1', ...argument }; },
    async findRosterById(argument) { calls.push(['findRosterById', argument]); return null; },
    async listRecentRosters(argument) { calls.push(['listRecentRosters', argument]); return [{ id: 'roster-2', importId: 'import-1', registrants: [], expiresAt: '2026-09-18T00:00:00.000Z' }]; },
    async deleteExpired(argument) { calls.push(['deleteExpired', argument]); return { deleted: 2 }; },
  });

  assert.deepEqual(await repository.createImport({ source: 'email', fingerprint: 'message-sha256', receivedAt: '2026-08-19T00:00:00.000Z' }), {
    id: 'import-1', source: 'email', fingerprint: 'message-sha256', receivedAt: '2026-08-19T00:00:00.000Z',
  });
  assert.deepEqual(await repository.saveRoster({ importId: 'import-1', registrants: [{ name: ' Ada Lovelace ' }], expiresAt: '2026-09-18T00:00:00.000Z' }), {
    id: 'roster-1', importId: 'import-1', registrants: [{ name: 'Ada Lovelace' }], expiresAt: '2026-09-18T00:00:00.000Z',
  });
  assert.equal(await repository.findRosterById({ id: 'missing', now: '2026-08-19T00:00:00.000Z' }), null);
  assert.deepEqual(await repository.listRecentRosters({ now: '2026-08-19T00:00:00.000Z', limit: 1 }), [{
    id: 'roster-2', importId: 'import-1', registrants: [], expiresAt: '2026-09-18T00:00:00.000Z',
  }]);
  assert.deepEqual(await repository.deleteExpired({ now: '2026-08-19T00:00:00.000Z' }), { deleted: 2 });
  assert.deepEqual(calls, [
    ['createImport', { source: 'email', fingerprint: 'message-sha256', receivedAt: '2026-08-19T00:00:00.000Z' }],
    ['saveRoster', { importId: 'import-1', registrants: [{ name: 'Ada Lovelace' }], expiresAt: '2026-09-18T00:00:00.000Z' }],
    ['findRosterById', { id: 'missing', now: '2026-08-19T00:00:00.000Z' }],
    ['listRecentRosters', { now: '2026-08-19T00:00:00.000Z', limit: 1 }],
    ['deleteExpired', { now: '2026-08-19T00:00:00.000Z' }],
  ]);
});

test('repository adapter rejects invalid arguments and results', async () => {
  const { createRosterRepository } = await source('repositories/roster_repository.js');
  const invalidResultCases = [
    ['createImport', { source: 'email', fingerprint: 'f', receivedAt: 'now' }, {}],
    ['saveRoster', { importId: 'import-1', registrants: [], expiresAt: 'later' }, {}],
    ['findRosterById', { id: 'roster-1', now: 'now' }, {}],
    ['listRecentRosters', { now: 'now', limit: 1 }, {}],
    ['deleteExpired', { now: 'now' }, {}],
  ];
  for (const [method, argument, result] of invalidResultCases) {
    const implementation = Object.fromEntries(['createImport', 'saveRoster', 'findRosterById', 'listRecentRosters', 'deleteExpired']
      .map(name => [name, async () => name === method ? result : null]));
    const repository = createRosterRepository(implementation);
    await assert.rejects(repository[method](argument));
  }
  const repository = createRosterRepository(Object.fromEntries(['createImport', 'saveRoster', 'findRosterById', 'listRecentRosters', 'deleteExpired']
    .map(name => [name, async () => null])));
  await assert.rejects(repository.findRosterById({ id: '', now: 'now' }), /id/);
  await assert.rejects(repository.listRecentRosters({ now: 'now', limit: 0 }), /limit/);
});

test('email ingestion validates data then persists only through repository methods', async () => {
  const { persistEmailRoster } = await source('contracts/email_ingestion.js');
  const calls = [];
  const repository = {
    async createImport(argument) {
      calls.push(['createImport', argument]);
      return { id: 'import-1', ...argument };
    },
    async saveRoster(argument) {
      calls.push(['saveRoster', argument]);
      return { id: 'roster-1', ...argument };
    },
    async findRosterById() {},
    async listRecentRosters() {},
    async deleteExpired() {},
  };

  const result = await persistEmailRoster({
    contentType: 'text/html', byteLength: 42, fingerprint: 'message-sha256',
    receivedAt: '2026-08-19T00:00:00.000Z', registrants: [{ name: ' Ada Lovelace ' }],
  }, repository, { expiresAt: '2026-09-18T00:00:00.000Z' });

  assert.deepEqual(calls, [
    ['createImport', { source: 'email', fingerprint: 'message-sha256', receivedAt: '2026-08-19T00:00:00.000Z' }],
    ['saveRoster', { importId: 'import-1', registrants: [{ name: 'Ada Lovelace' }], expiresAt: '2026-09-18T00:00:00.000Z' }],
  ]);
  assert.deepEqual(result, {
    id: 'roster-1', importId: 'import-1', registrants: [{ name: 'Ada Lovelace' }], expiresAt: '2026-09-18T00:00:00.000Z',
  });
});
