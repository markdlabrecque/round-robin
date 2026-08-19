'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fixturePath = path.join(__dirname, 'fixtures', 'email', 'representative-registration.multipart.eml');
const handlerPath = path.join(__dirname, '..', 'src', 'email', 'handler.js');

function fakeRepository(calls) {
  return {
    async createImport(argument) {
      calls.push(['createImport', argument]);
      return { id: 'import-1', ...argument };
    },
    async saveRoster(argument) {
      calls.push(['saveRoster', argument]);
      return { id: 'roster-1', ...argument };
    },
    async findRosterById() { return null; },
    async listRecentRosters() { return []; },
    async deleteExpired() { return { deleted: 0 }; },
  };
}

test('accepts a bounded registration MIME message and persists only its parsed roster', async () => {
  assert.ok(fs.existsSync(handlerPath), 'missing additive inbound email handler at src/email/handler.js');
  const { createEmailHandler } = await import(`${pathToFileURL(handlerPath).href}?test=${Date.now()}`);
  const raw = fs.readFileSync(fixturePath);
  const calls = [];
  const logs = [];
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...arguments_) => {
    requests.push(arguments_);
    throw new Error('Imported message resources must not be requested.');
  };

  try {
    const handler = createEmailHandler({
      recipient: 'registrations@example.test',
      repository: fakeRepository(calls),
      expiresAt: '2026-09-18T00:00:00.000Z',
      now: () => '2026-08-19T00:00:00.000Z',
      logger: { info: (...values) => logs.push(values), warn: (...values) => logs.push(values), error: (...values) => logs.push(values) },
    });
    const result = await handler({
      from: 'sender@example.test',
      to: 'registrations@example.test',
      raw: new ReadableStream({ start(controller) { controller.enqueue(raw); controller.close(); } }),
      setReject() { throw new Error('A valid recipient and bounded message must not be rejected.'); },
    });

    assert.deepEqual(result, { status: 'accepted', importId: 'import-1', rosterId: 'roster-1' });
    assert.deepEqual(calls, [
      ['createImport', {
        source: 'email',
        fingerprint: '1e736ab2e036a366fa46ce56a197bffeb71ab5e8cad1174a53c4ab8f37546336',
        receivedAt: '2026-08-19T00:00:00.000Z',
      }],
      ['saveRoster', {
        importId: 'import-1',
        registrants: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
        expiresAt: '2026-09-18T00:00:00.000Z',
      }],
    ]);
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), calls[0][1].fingerprint);
    assert.deepEqual(requests, []);
    const logText = JSON.stringify(logs);
    for (const forbidden of [raw.toString('utf8'), 'Ada Lovelace', 'Grace Hopper', 'sender@example.test', 'registrations@example.test']) {
      assert.doesNotMatch(logText, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
