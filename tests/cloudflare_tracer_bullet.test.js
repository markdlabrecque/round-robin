'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.join(__dirname, '..');

function requiredPath(...segments) {
  const target = path.join(repositoryRoot, ...segments);
  assert.ok(fs.existsSync(target), `missing required migration boundary: ${segments.join('/')}`);
  return target;
}

test('Worker serves versioned health JSON at the same-origin API path', async () => {
  const workerPath = requiredPath('src', 'worker.js');
  const worker = await import(`${pathToFileURL(workerPath).href}?test=${Date.now()}`);
  const response = await worker.default.fetch(
    new Request('https://round-robin.invalid/api/health'),
    {},
    {},
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json(?:;|$)/);
  assert.deepEqual(await response.json(), { version: 1, status: 'ok' });
});

test('the Worker layout has one public asset tree and isolated shared contracts', () => {
  const publicIndex = requiredPath('public', 'index.html');
  const wranglerConfig = fs.readFileSync(requiredPath('wrangler.jsonc'), 'utf8');

  assert.ok(fs.statSync(publicIndex).isFile());
  assert.match(wranglerConfig, /"directory"\s*:\s*"public"/);
  assert.ok(fs.statSync(requiredPath('src', 'contracts')).isDirectory());
  assert.ok(fs.statSync(requiredPath('src', 'repositories', 'roster_repository.js')).isFile());
});
