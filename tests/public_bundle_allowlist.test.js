'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertPublicBundle } = require('../scripts/check_public_bundle.js');

function withBundle(files, assertion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'round-robin-public-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    assertion(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('public bundle rejects registrant payloads in every allowlisted text file', () => {
  for (const [name, content] of [
    ['demo_roster.json', JSON.stringify({ registrants: [{ name: 'Ada Lovelace' }] })],
    ['app.js', "const roster = { registrants: [{ name: 'Ada Lovelace' }] };"],
    ['app.js', 'const payload = "{\\\"registrants\\\":[{\\\"name\\\":\\\"Ada Lovelace\\\"}]}";'],
    ['index.html', '<script type="application/json">{"registrants":[{"name":"Ada Lovelace"}]}</script>'],
  ]) {
    withBundle({ [name]: content }, root => {
      assert.throws(() => assertPublicBundle(root), /registrant payload|must not contain registrant data/);
    });
  }
});

test('public bundle rejects fixtures, raw email, and secrets', () => {
  for (const [name, content] of [
    ['fixture.js', 'export default {};'],
    ['raw-email.eml', 'From: member@example.test'],
    ['app.js', '-----BEGIN PRIVATE KEY-----'],
    ['app.js', 'member@example.test'],
  ]) {
    withBundle({ [name]: content }, root => {
      assert.throws(() => assertPublicBundle(root));
    });
  }
});
