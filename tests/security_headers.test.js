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

const deployedCsp = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-src 'none'; img-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

function apiRequest(headers = {}) {
  return new Request('https://round-robin.invalid/api/health', { headers });
}

test('additive response-header policy uses every deployed CSP directive and removes CORS headers', async () => {
  const { applyResponseSecurityHeaders } = await responseHeaderPolicy();
  const response = applyResponseSecurityHeaders(new Response('{"status":"ok"}', {
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization',
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-origin': '*',
      'content-type': 'application/json; charset=utf-8',
    },
  }), apiRequest());

  assert.equal(response.status, 200);
  assert.ok(
    [deployedCsp, `${deployedCsp}; frame-ancestors 'none'`].includes(response.headers.get('content-security-policy')),
    'CSP must match the deployed policy, optionally adding frame-ancestors',
  );
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('permissions-policy'), 'geolocation=(), microphone=(), camera=()');
  assert.deepEqual(
    [...response.headers.keys()].filter(name => name.startsWith('access-control-')),
    [],
  );
});

test('same-origin API policy allows no Origin but rejects malformed and cross-origin Origin headers', async () => {
  const { applyResponseSecurityHeaders } = await responseHeaderPolicy();
  const response = new Response('{"status":"ok"}');

  assert.doesNotThrow(() => applyResponseSecurityHeaders(response.clone(), apiRequest()));
  assert.doesNotThrow(() => applyResponseSecurityHeaders(
    response.clone(),
    apiRequest({ oRiGiN: 'https://round-robin.invalid' }),
  ));
  assert.throws(
    () => applyResponseSecurityHeaders(response.clone(), apiRequest({ Origin: 'not a URL' })),
    /origin|cors|same-origin/i,
  );
  assert.throws(
    () => applyResponseSecurityHeaders(response.clone(), apiRequest({ Origin: 'https://attacker.invalid' })),
    /origin|cors|same-origin/i,
  );
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
