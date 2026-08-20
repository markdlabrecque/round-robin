'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const handlerPath = path.join(__dirname, '..', 'src', 'email', 'handler.js');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'email', 'representative-registration.multipart.eml'));

async function createHandler(calls) {
  const { createEmailHandler } = await import(`${pathToFileURL(handlerPath).href}?test=${Date.now()}-${Math.random()}`);
  return createEmailHandler({
    recipient: 'registrations@example.test',
    repository: {
      async createImport(value) { calls.push(['createImport', value]); return { id: 'import-1', ...value }; },
      async saveRoster(value) { calls.push(['saveRoster', value]); return { id: 'roster-1', ...value }; },
      async findRosterById() { return null; }, async listRecentRosters() { return []; }, async deleteExpired() { return { deleted: 0 }; },
    },
    expiresAt: '2026-09-18T00:00:00.000Z', logger: { warn() {} },
  });
}

function message(raw, to = 'registrations@example.test', rejected = []) {
  return { to, raw, setReject(code) { rejected.push(code); } };
}

test('rejects wrong recipients, malformed MIME, and oversized messages before persistence', async () => {
  const cases = [
    [new Uint8Array(), 'other@example.test', 'invalid_input'],
    [new TextEncoder().encode('Content-Type: multipart/alternative; boundary="none"\r\n\r\n--none\r\n'), undefined, 'invalid_input'],
    [new Uint8Array(1024 * 1024 + 1), undefined, 'payload_too_large'],
  ];
  for (const [raw, to, expected] of cases) {
    const calls = [];
    const rejected = [];
    const result = await (await createHandler(calls))(message(
      new ReadableStream({ start(controller) { controller.enqueue(raw); controller.close(); } }), to, rejected,
    ));
    assert.deepEqual(result, { status: 'rejected', error: expected });
    assert.deepEqual(rejected, [expected]);
    assert.deepEqual(calls, []);
  }
});

test('rejects attachments, non-HTML bodies, and roster fields outside the shared limits', async () => {
  const messages = [
    'Content-Type: multipart/mixed; boundary="part"\r\n\r\n--part\r\nContent-Type: text/html\r\n\r\n<table><tr><td>Ada</td><td>Lovelace</td></tr></table>\r\n--part\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename="list.pdf"\r\n\r\nnot-a-pdf\r\n--part--',
    'Content-Type: text/plain\r\n\r\nAda Lovelace',
    `Content-Type: text/html\r\n\r\n<table><tr><td>${'A'.repeat(121)}</td><td>Lovelace</td></tr></table>`,
  ];
  for (const source of messages) {
    const calls = [];
    const result = await (await createHandler(calls))(message(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(source)); controller.close(); },
    })));
    assert.equal(result.status, 'rejected');
    assert.deepEqual(calls, []);
  }
});

test('uses the delivery fingerprint to avoid duplicate persistence', async () => {
  const calls = [];
  const handler = await createHandler(calls);
  const send = () => handler(message(new ReadableStream({ start(controller) { controller.enqueue(fixture); controller.close(); } })));
  assert.deepEqual(await send(), await send());
  assert.equal(calls.filter(([name]) => name === 'createImport').length, 1);
  assert.equal(calls.filter(([name]) => name === 'saveRoster').length, 1);
});
