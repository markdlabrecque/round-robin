'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RegistrationImport = require('../public/registration_import.js');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const controlIds = [
  'courts', 'registration-file', 'registration-file-label', 'shuffle', 'complete-round',
  'previous-round', 'next-round', 'round', 'round-position', 'status', 'player-count',
  'roster-panel', 'roster-summary', 'registrant-list', 'add-player', 'reset-app',
];

function element(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    disabled: false,
    hidden: false,
    readOnly: false,
    textContent: '',
    value: '',
    files: [],
    attributes: new Map(),
    listeners: new Map(),
    classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    querySelectorAll(selector) {
      const matches = [];
      const visit = node => {
        for (const child of node.children || []) {
          if (selector === 'input:checked' && child.tagName === 'INPUT' && child.checked) matches.push(child);
          visit(child);
        }
      };
      visit(this);
      return matches;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle() {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

function bootApp(fetch, {
  confirm = () => true,
  parseRegistrationEmail = () => ['Ada Lovelace'],
} = {}) {
  const elements = Object.fromEntries(controlIds.map(id => [id, element()]));
  const playerInputs = Array.from({ length: 24 }, () => element('input'));
  const savedStates = [];
  const localStorage = {
    getItem() { return null; },
    setItem(key, value) { savedStates.push({ key, value: JSON.parse(value) }); },
    removeItem() {},
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tagName) { return element(tagName); },
    createTextNode(text) { return { textContent: text }; },
    querySelectorAll(selector) { return selector === '.player' ? playerInputs : []; },
  };
  const window = {
    confirm() { return confirm(); },
    prompt() { return null; },
    setTimeout() {},
    location: { reload() {} },
  };
  const sandbox = {
    console,
    document,
    window,
    fetch,
    localStorage,
    RoundRobinScheduler: {
      scheduleRound(players, rounds, options) {
        return { slots: [...players, ...Array(options.capacity - players.length).fill('')], partnerRepeats: 0 };
      },
    },
    RegistrationEmailParser: { parseRegistrationEmail },
    RegistrationImport,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(appSource, sandbox, { filename: 'public/app.js' });
  return { elements, savedStates };
}

function registrationFile(reads) {
  return {
    name: 'registrations.html',
    text() {
      reads.count++;
      return Promise.resolve('<table><tr><td>Ada</td><td>Lovelace</td></tr></table>');
    },
  };
}

test('keeps imports inactive until the demo roster is ready, then persists the imported roster against that roster key', async () => {
  const loading = deferred();
  const { elements, savedStates } = bootApp(() => loading.promise);
  const reads = { count: 0 };
  elements['registration-file'].files = [registrationFile(reads)];

  assert.equal(elements['registration-file'].disabled, true);
  await elements['registration-file'].listeners.get('change')();
  assert.equal(reads.count, 0);
  assert.equal(savedStates.length, 0);

  loading.resolve({
    ok: true,
    json: async () => ({ registrants: [{ name: 'Demo Player' }] }),
  });
  await settle();

  assert.equal(elements['registration-file'].disabled, false);
  await elements['registration-file'].listeners.get('change')();
  assert.equal(reads.count, 1);
  assert.deepEqual(savedStates.at(-1), {
    key: 'roundRobinAssignment:v2',
    value: {
      scriptRosterKey: JSON.stringify(['Demo Player']),
      roster: ['Ada Lovelace'],
      activeRoster: ['Ada Lovelace'],
      slots: ['Ada Lovelace', ...Array(23).fill('')],
      completedRounds: [],
    },
  });
});

test('releases the import control after demo initialization fails', async () => {
  const loading = deferred();
  const { elements } = bootApp(() => loading.promise);

  assert.equal(elements['registration-file'].disabled, true);
  loading.reject(new Error('offline'));
  await settle();

  assert.equal(elements['registration-file'].disabled, false);
  assert.match(elements.status.textContent, /Could not start the demo: offline/);
});

test('preserves persisted state when an import is cancelled or cannot be parsed', async t => {
  for (const [name, options, expectedStatus] of [
    ['cancelled', { confirm: () => false }, /^$/],
    ['invalid', { parseRegistrationEmail: () => { throw new Error('bad registration'); } }, /Could not import registrations.html: bad registration/],
  ]) {
    await t.test(name, async () => {
      const { elements, savedStates } = bootApp(async () => ({
        ok: true,
        json: async () => ({ registrants: [{ name: 'Demo Player' }] }),
      }), options);
      await settle();
      const persistedState = structuredClone(savedStates.at(-1));
      const savesBeforeImport = savedStates.length;
      const reads = { count: 0 };
      elements['registration-file'].files = [registrationFile(reads)];

      await elements['registration-file'].listeners.get('change')();

      assert.equal(reads.count, 1);
      assert.equal(savedStates.length, savesBeforeImport);
      assert.deepEqual(savedStates.at(-1), persistedState);
      assert.match(elements.status.textContent, expectedStatus);
    });
  }
});
