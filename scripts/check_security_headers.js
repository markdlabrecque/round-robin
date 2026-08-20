'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

async function securityModules() {
  return import(pathToFileURL(path.join(root, 'src/security/response_headers.js')).href);
}

const DEPLOYED_CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-src 'none'; img-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

function apiRequest(headers = {}) {
  return new Request('https://round-robin.invalid/api/health', { headers });
}

async function assertSecurityHeaders() {
  const { applyResponseSecurityHeaders } = await securityModules();
  for (const response of [
    new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{"status":"ok"}', {
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'authorization',
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-origin': '*',
      },
    }),
  ]) {
    const secured = applyResponseSecurityHeaders(response, apiRequest());
    assert.equal(secured.headers.get('content-security-policy'), `${DEPLOYED_CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`);
    assert.equal(secured.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(
      [...secured.headers.keys()].filter(name => name.startsWith('access-control-')),
      [],
    );
  }
  assert.doesNotThrow(() => applyResponseSecurityHeaders(new Response('ok'), apiRequest()));
  assert.doesNotThrow(() => applyResponseSecurityHeaders(new Response('ok'), apiRequest({ origin: 'https://round-robin.invalid' })));
  for (const origin of ['not a URL', 'https://other.invalid']) {
    assert.throws(
      () => applyResponseSecurityHeaders(new Response('ok'), apiRequest({ origin })),
      /origin|cors|same-origin/i,
    );
  }
}

if (require.main === module) {
  assertSecurityHeaders().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { assertSecurityHeaders };
