'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const controlIds = [
  'courts', 'registration-file', 'registration-file-label', 'shuffle', 'complete-round',
  'previous-round', 'next-round', 'round', 'round-position', 'status', 'player-count',
  'roster-panel', 'roster-summary', 'registrant-list', 'add-player', 'reset-app',
  'recent-imports', 'load-recent-import', 'retry-recent-imports',
];

function element(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(), children: [], className: '', disabled: false, hidden: false,
    readOnly: false, textContent: '', value: '', files: [], attributes: new Map(), listeners: new Map(),
    classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    querySelectorAll(selector) {
      const matches = [];
      const visit = node => (node.children || []).forEach(child => {
        if (selector === 'input:checked' && child.tagName === 'INPUT' && child.checked) matches.push(child);
        visit(child);
      });
      visit(this);
      return matches;
    },
  };
}

async function settle() {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

function bootApp(fetch) {
  const elements = Object.fromEntries(controlIds.map(id => [id, element(id === 'registration-file' ? 'input' : undefined)]));
  const playerInputs = Array.from({ length: 24 }, () => element('input'));
  const savedStates = [];
  const sandbox = {
    console,
    fetch,
    document: {
      getElementById(id) { return elements[id]; },
      createElement(tagName) { return element(tagName); },
      createTextNode(text) { return { textContent: text }; },
      querySelectorAll(selector) { return selector === '.player' ? playerInputs : []; },
    },
    window: { confirm: () => true, prompt: () => null, setTimeout() {}, location: { reload() {} } },
    localStorage: {
      getItem() { return null; },
      setItem(key, value) { savedStates.push({ key, value: JSON.parse(value) }); },
      removeItem() {},
    },
    RoundRobinScheduler: {
      scheduleRound(players, rounds, options) {
        return { slots: [...players, ...Array(options.capacity - players.length).fill('')], partnerRepeats: 0 };
      },
    },
    RegistrationEmailParser: { parseRegistrationEmail: () => [] },
    RegistrationImport: require('../public/registration_import.js'),
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(appSource, sandbox, { filename: 'public/app.js' });
  return { elements, savedStates };
}

test('lists a same-origin recent import and loads its versioned roster into scheduling without disabling local HTML recovery', async () => {
  const requests = [];
  const { elements, savedStates } = bootApp(async (url, options) => {
    requests.push({ url, options });
    if (url === '/api/imports') return { ok: true, json: async () => ({
      version: 1,
      imports: [{ id: 'import-1', rosterId: 'roster-1', source: 'email', receivedAt: '2026-08-19T00:00:00.000Z' }],
    }) };
    if (url === '/api/rosters/roster-1') return { ok: true, json: async () => ({
      version: 1,
      roster: {
        id: 'roster-1', registrants: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
        createdAt: '2026-08-19T00:00:00.000Z', expiresAt: '2026-09-18T00:00:00.000Z',
      },
    }) };
    throw new Error(`Unexpected request: ${url}`);
  });

  await settle();
  assert.deepEqual(requests.map(request => ({ url: request.url, cache: request.options.cache })), [
    { url: '/api/imports', cache: 'no-store' },
  ]);
  assert.equal(elements['recent-imports'].children.length, 1);
  assert.equal(elements['recent-imports'].children[0].value, 'roster-1');
  assert.equal(elements['registration-file'].disabled, false);

  elements['recent-imports'].value = 'roster-1';
  await elements['load-recent-import'].listeners.get('click')();

  assert.deepEqual(requests.map(request => request.url), ['/api/imports', '/api/rosters/roster-1']);
  assert.deepEqual(savedStates.at(-1), {
    key: 'roundRobinAssignment:v2',
    value: {
      scriptRosterKey: 'remote:roster-1', roster: ['Ada Lovelace', 'Grace Hopper'],
      activeRoster: ['Ada Lovelace', 'Grace Hopper'],
      slots: ['Ada Lovelace', 'Grace Hopper', ...Array(22).fill('')], completedRounds: [],
    },
  });
  assert.equal(elements['registration-file'].disabled, false);
});
