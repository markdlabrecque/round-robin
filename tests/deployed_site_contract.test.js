'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { elementsByTag, parseHtmlDocument } = require('./helpers/html_document.js');

const repositoryRoot = path.join(__dirname, '..');
const deployedRoot = path.join(repositoryRoot, 'public');
const deployedOrigin = 'https://round-robin.invalid';

function readHtml(relativePath) {
  return parseHtmlDocument(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

function cspDirectives(content) {
  return new Map(content.split(';').map(part => {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    return [tokens[0], tokens.slice(1)];
  }).filter(([name]) => name));
}

function localAssetPath(reference) {
  const url = new URL(reference, `${deployedOrigin}/index.html`);
  assert.equal(url.origin, deployedOrigin, `asset must stay on the deployed origin: ${reference}`);
  assert.equal(url.search, '', `asset reference must not depend on a query string: ${reference}`);
  assert.equal(url.hash, '', `asset reference must not depend on a fragment: ${reference}`);
  assert.ok(url.pathname.startsWith('/'), `asset must be relative to docs/: ${reference}`);
  const assetPath = path.resolve(deployedRoot, url.pathname.slice(1));
  assert.ok(assetPath.startsWith(`${deployedRoot}${path.sep}`), `asset escapes public/: ${reference}`);
  return assetPath;
}

test('the deployed index has a strict local-only asset and CSP contract', () => {
  const document = readHtml('public/index.html');
  const cspMeta = elementsByTag(document, 'meta').filter(meta => meta.attributes.get('http-equiv')?.toLowerCase() === 'content-security-policy');
  const registrationInputs = elementsByTag(document, 'input').filter(input => input.attributes.get('id') === 'registration-file');
  const scripts = elementsByTag(document, 'script');
  const assets = [
    ...scripts.map(script => script.attributes.get('src')),
    ...elementsByTag(document, 'img').map(image => image.attributes.get('src')),
  ];

  assert.equal(cspMeta.length, 1);
  assert.equal(registrationInputs.length, 1);
  assert.equal(registrationInputs[0].attributes.has('disabled'), true);
  assert.deepEqual(cspDirectives(cspMeta[0].attributes.get('content')), new Map([
    ['default-src', ["'self'"]],
    ['base-uri', ["'none'"]],
    ['connect-src', ["'self'"]],
    ['font-src', ["'self'"]],
    ['form-action', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['img-src', ["'self'"]],
    ['media-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
  ]));
  assert.deepEqual(scripts.map(script => script.attributes.get('src')), [
    'round_scheduler.js',
    'registration_email_parser.js',
    'registration_import.js',
    'app.js',
  ]);
  assert.ok(assets.every(Boolean));
  for (const asset of assets) assert.ok(fs.statSync(localAssetPath(asset)).isFile(), `missing deployed asset: ${asset}`);
});

test('the root entrypoint only routes users to docs and has no obsolete import flow', () => {
  const document = readHtml('index.html');
  const refresh = elementsByTag(document, 'meta').filter(meta => meta.attributes.get('http-equiv')?.toLowerCase() === 'refresh');
  const links = elementsByTag(document, 'a');

  assert.deepEqual(refresh.map(meta => meta.attributes.get('content')), ['0; url=docs/']);
  assert.deepEqual(links.map(link => link.attributes.get('href')), ['docs/']);
  assert.equal(elementsByTag(document, 'form').length, 0);
  assert.equal(elementsByTag(document, 'script').length, 0);
});
