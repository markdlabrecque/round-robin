'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const baseURL = process.env.ROUND_ROBIN_URL || 'http://127.0.0.1:8080';
const name = 'Jamie de la Cruz-Williams';
let browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }) });
});
test.after(async () => { await browser?.close(); });

async function assertLockedFocus(page) {
  const input = page.locator('.player').first();
  assert.ok(await input.evaluate(el => el === document.activeElement && el.readOnly), 'Tab must focus the read-only slot');
  await page.waitForTimeout(200); // Allow the existing 150ms focus transition to finish.
  const state = await input.evaluate(el => {
    const display = el.previousElementSibling;
    const style = getComputedStyle(display);
    return { name: display.innerText.replace(/\s+/g, ' ').trim(), value: el.value,
      visibility: style.visibility, opacity: style.opacity, editorOpacity: getComputedStyle(el).opacity,
      border: style.borderTopColor, shadow: style.boxShadow,
      lines: [...display.children].map(child => child.getBoundingClientRect().top) };
  });
  assert.equal(state.name, name);
  assert.equal(state.value, name);
  assert.equal(state.visibility, 'visible');
  assert.equal(state.opacity, '1');
  assert.equal(state.editorOpacity, '0', 'history must not reopen the editor');
  assert.equal(state.border, 'rgb(255, 209, 102)', 'visible name must have the gold focus border');
  assert.equal(state.shadow, 'rgba(255, 209, 102, 0.25) 0px 0px 0px 3px', 'visible name must have the focus ring');
  assert.ok(state.lines[1] > state.lines[0], 'history must retain its two-line name');
  await page.keyboard.type('Changed');
  assert.equal(await input.inputValue(), name, 'keyboard input must not change history');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  assert.equal(await input.evaluate(el => getComputedStyle(el.previousElementSibling).boxShadow), 'none',
    'focus ring must leave the previous slot');
}

for (const pagePath of ['index.html', 'docs/index.html']) {
  for (const width of [1440, 375]) {
    test(`${pagePath} at ${width}px: Tab from Players visibly focuses locked history`, async t => {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      t.after(() => page.close());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const roster = { registrants: [{ name }] };
      await page.route('**/registrants.js', route => route.fulfill({ contentType: 'application/javascript',
        body: `window.ROUND_ROBIN_ROSTER = ${JSON.stringify(roster)};` }));
      await page.route('**/registrants.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(roster) }));
      const key = pagePath === 'index.html' ? 'roundRobinAssignment:v1' : 'roundRobinAssignment:v2';
      await page.addInitScript(({ key, name }) => localStorage.setItem(key, JSON.stringify({
        scriptRosterKey: JSON.stringify([name]), roster: [name], activeRoster: [name],
        slots: [name, ...Array(23).fill('')], completedRounds: [],
      })), { key, name });
      await page.goto(`${baseURL}/${pagePath}`);
      await page.locator('#complete-round').click();
      await page.locator('#previous-round').click();
      await page.locator('#roster-summary').focus();
      await page.keyboard.press('Tab');
      await assertLockedFocus(page);
      assert.deepEqual(errors, []);
    });
  }
}

test('reusable court template: focused read-only name has the same visible ring', async t => {
  const page = await browser.newPage({ viewport: { width: 375, height: 1000 } });
  t.after(() => page.close());
  const html = await fs.readFile(path.join(__dirname, '../templates/court.html'), 'utf8');
  const css = await fs.readFile(path.join(__dirname, '../templates/court.css'), 'utf8');
  await page.setContent(`<style>:root { --accent: #ffd166; } * { box-sizing: border-box; } ${css}</style><button>Players</button>${html}`);
  await page.locator('.player').first().evaluate((el, name) => {
    el.value = name;
    el.dispatchEvent(new Event('input'));
    el.readOnly = true;
  }, name);
  await page.locator('button').focus();
  await page.keyboard.press('Tab');
  await assertLockedFocus(page);
});
