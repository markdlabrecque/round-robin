'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');
const ALLOWED_FILES = new Set([
  'index.html',
  'app.js',
  'round_scheduler.js',
  'registration_email_parser.js',
  'registration_import.js',
  'demo_roster.json',
  'assets/nspc-logo.png',
]);
const FORBIDDEN_CONTENT = [
  // Matches serialized roster records without treating ordinary references such as data.registrants as data.
  { name: 'registrant payload', pattern: /\b(?:\\?['"])?registrants(?:\\?['"])?\s*[:=]\s*\[\s*\{[^}]*\b(?:\\?['"])?name(?:\\?['"])?\s*:/is },
  { name: 'email address', pattern: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Cloudflare credential', pattern: /(?:cloudflare|cf)[_-]?(?:api)?[_-]?token\s*[:=]/i },
];

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  });
}

function assertDemoRosterIsEmpty(file) {
  let roster;
  try {
    roster = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Public demo roster must be valid JSON.');
  }
  if (!roster || !Array.isArray(roster.registrants) || roster.registrants.length !== 0 || Object.keys(roster).length !== 1) {
    throw new Error('Public demo roster must not contain registrant data.');
  }
}

function assertPublicBundle(root = PUBLIC_ROOT) {
  for (const file of filesIn(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (!ALLOWED_FILES.has(relative)) throw new Error(`Public bundle file is not allowlisted: ${relative}`);
    if (!/\.(?:html|js|json|png)$/.test(relative)) throw new Error(`Public bundle file type is not allowed: ${relative}`);
    if (/registrant|registration.*\.html|raw.*email|fixture|secret/i.test(relative)) {
      throw new Error(`Public bundle must not contain registrant data or fixtures: ${relative}`);
    }
    if (relative === 'demo_roster.json') assertDemoRosterIsEmpty(file);
    if (!file.endsWith('.png')) {
      const content = fs.readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_CONTENT) {
        if (forbidden.pattern.test(content)) throw new Error(`Public bundle contains ${forbidden.name}: ${relative}`);
      }
    }
  }
}

if (require.main === module) assertPublicBundle();

module.exports = { ALLOWED_FILES, assertDemoRosterIsEmpty, assertPublicBundle };
