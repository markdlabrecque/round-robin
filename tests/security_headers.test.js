'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseRegistrationEmail } = require('../public/registration_email_parser.js');

const repositoryRoot = path.join(__dirname, '..');

async function responseHeaderPolicy() {
  const policyPath = path.join(repositoryRoot, 'src', 'security', 'response_headers.js');
  assert.ok(fs.existsSync(policyPath), 'missing additive response-header policy: src/security/response_headers.js');
  return import(`${pathToFileURL(policyPath).href}?security-test=${Date.now()}`);
}

test('additive response-header policy protects arbitrary API responses without broad CORS', async () => {
  const { applyResponseSecurityHeaders } = await responseHeaderPolicy();
  const response = applyResponseSecurityHeaders(new Response('{"status":"ok"}', {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-security-policy'),
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  );
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('permissions-policy'), 'geolocation=(), microphone=(), camera=()');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('parsing sanitized untrusted upload HTML makes no external requests', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'security', 'untrusted-upload.html'), 'utf8');
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = () => {
    fetchCalls += 1;
    throw new Error('untrusted markup must not trigger network access');
  };

  try {
    assert.deepEqual(parseRegistrationEmail(html), ['Security Example']);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
