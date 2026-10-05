'use strict';

// Run against the Docker web service with ROUND_ROBIN_URL and Playwright on NODE_PATH.
// Uses node:test, like test_round_scheduler.js; no production files are rewritten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.ROUND_ROBIN_URL || 'http://127.0.0.1:8080';
const key = 'roundRobinAssignment:v2';
const names = [
  'Alex van der Berg-Smith',
  'Cher',
  'Alexanderthegreatest Montgomery-Worthington-Smythe van der Verylongsurname',
  '<img src=x onerror=alert(1)> Smith',
  'Taylor\t  de la Cruz',
];
const slots = [...names, ...Array(24 - names.length).fill('')];
const rosterData = { registrants: names.map(name => ({ name })) };
let browser;

test.before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }),
  });
});
test.after(async () => { await browser?.close(); });

async function openPage(t, pagePath, width = 1440, restore = true) {
  const key = pagePath === 'index.html' ? 'roundRobinAssignment:v1' : 'roundRobinAssignment:v2';
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', request => errors.push(`request: ${request.url()}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  // Root requires a missing registrants.js; docs has its own JSON startup interface.
  await page.route('**/registrants.js', route => route.fulfill({
    contentType: 'application/javascript', body: `window.ROUND_ROBIN_ROSTER = ${JSON.stringify(rosterData)};`,
  }));
  await page.route('**/registrants.json*', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(rosterData),
  }));
  if (restore) {
    await page.addInitScript(({ key, names, slots }) => {
      // Seed only once so reload exercises the application's saved edits.
      if (!sessionStorage.getItem('name-test-seeded')) {
        localStorage.setItem(key, JSON.stringify({
          scriptRosterKey: JSON.stringify(names), roster: names, activeRoster: names,
          slots, completedRounds: [],
        }));
        sessionStorage.setItem('name-test-seeded', 'yes');
      }
    }, { key, names, slots });
  }
  await page.goto(`${baseURL}/${pagePath}`);
  await page.waitForFunction(count => document.querySelectorAll('.registrant').length === count, names.length);
  t.after(() => assert.deepEqual(errors, [], 'unexpected browser/network errors'));
  return page;
}

// Measure rendered text, not class names or a particular span structure. Hidden
// editing inputs may coexist with a display, but cannot count as visible names.
async function renderedName(page, index) {
  return page.evaluate(index => {
    const zone = document.querySelectorAll('.svc')[index];
    const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    const glyphs = [];
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent.closest('script, style, textarea')) continue;
      if (getComputedStyle(parent).visibility === 'hidden') continue;
      for (let offset = 0; offset < node.length; offset++) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const r = range.getBoundingClientRect();
        if (r.width && r.height) glyphs.push({
          char: node.data[offset], x: r.x, y: r.y, right: r.right, bottom: r.bottom,
          size: parseFloat(getComputedStyle(parent).fontSize),
        });
      }
    }
    const r = zone.getBoundingClientRect();
    return { glyphs, bounds: { x: r.x, y: r.y, right: r.right, bottom: r.bottom },
      text: zone.innerText.trim().replace(/\s+/g, ' ') };
  }, index);
}

for (const pagePath of ['index.html', 'docs/index.html']) {
  const key = pagePath === 'index.html' ? 'roundRobinAssignment:v1' : 'roundRobinAssignment:v2';
  for (const width of [1440, 375]) {
    test(`${pagePath} at ${width}px: roster names are larger than the old 14px labels`, async t => {
      const page = await openPage(t, pagePath, width);
      await page.evaluate(() => { document.querySelector('#roster-panel').open = true; });
      const sizes = await page.evaluate(() => [...document.querySelectorAll('.registrant span')]
        .map(el => parseFloat(getComputedStyle(el).fontSize)));
      assert.ok(sizes.every(size => size > 14), `roster name sizes: ${sizes.join(', ')}`);
    });

    for (const [index, name] of names.entries()) {
      test(`${pagePath} at ${width}px: visible two-part safe name ${index + 1}`, async t => {
        const page = await openPage(t, pagePath, width);
        const display = await renderedName(page, index);
        assert.equal(display.text, name.replace(/\s+/g, ' '), 'the full name must be visible text, not only a single-line input value');
        const letters = display.glyphs.filter(g => !/\s/.test(g.char));
        assert.ok(letters.every(g => g.size > 15), 'court names must exceed the old 15px maximum');
        const first = name.split(/\s+/)[0];
        if (/\s/.test(name)) {
          const remainderStart = first.replace(/\s/g, '').length;
          const firstTokenBottomLine = Math.max(...letters.slice(0, remainderStart).map(g => g.y));
          assert.ok(letters[remainderStart].y > firstTokenBottomLine + 1,
            'the remaining name must start below the first whitespace-delimited token');
        } else {
          assert.equal(display.text, 'Cher', 'single-token names must not gain a surname');
        }
        assert.ok(letters.every(g => g.x >= display.bounds.x - 1 && g.right <= display.bounds.right + 1 &&
          g.y >= display.bounds.y - 1 && g.bottom <= display.bounds.bottom + 1), 'names must wrap within their court slot');
        assert.equal(await page.evaluate(() => document.querySelectorAll('.svc img, .registrant img').length), 0,
          'HTML-like names must never create HTML elements');
      });
    }
  }

  test(`${pagePath}: edits and restored/history names use the same two-part display`, async t => {
    const page = await openPage(t, pagePath);
    const selector = '[aria-label="Court 1, top side, player 1"]';
    const edited = 'Jamie de la Cruz-Williams';
    await page.locator('.svc').first().click();
    await page.locator(selector).fill(edited);
    await page.locator(selector).dispatchEvent('change');
    await page.locator('#round-position').click();
    assert.equal((await renderedName(page, 0)).text, edited, 'edited name must update its visible display');
    await page.reload();
    await page.waitForFunction(count => document.querySelectorAll('.registrant').length === count, names.length);
    assert.equal((await renderedName(page, 0)).text, edited, 'restored name must have a visible display');
    await page.locator('#complete-round').click();
    await page.locator('#previous-round').click();
    const display = await renderedName(page, 0);
    assert.equal(display.text, edited, 'completed round must render its saved name');
    const letters = display.glyphs.filter(g => !/\s/.test(g.char));
    assert.ok(letters[5].y > letters[0].y + 1, 'history must retain two-part presentation');
    await page.locator('#roster-summary').focus();
    await page.keyboard.press('Tab');
    const focus = await page.locator(selector).evaluate(el => {
      const display = el.parentElement.querySelector('.player-name');
      const style = getComputedStyle(display);
      return {
        focused: document.activeElement === el, readOnly: el.readOnly,
        opacity: getComputedStyle(el).opacity, visibility: style.visibility,
        border: style.borderColor, shadow: style.boxShadow,
      };
    });
    assert.ok(focus.focused && focus.readOnly, 'Tab must reach the locked history slot');
    assert.equal(focus.opacity, '0', 'history must not reopen the editor');
    assert.equal(focus.visibility, 'visible', 'focused history name must remain visible');
    assert.equal(focus.border, 'rgb(255, 209, 102)', 'visible history name must have a gold focus border');
    assert.equal(focus.shadow, 'rgba(255, 209, 102, 0.25) 0px 0px 0px 3px', 'visible history name must have a focus ring');
    assert.equal((await renderedName(page, 0)).text, edited, 'focus must preserve the saved name');
  });

  test(`${pagePath}: editing, storage, shuffle, selection and locked history are preserved`, async t => {
    const page = await openPage(t, pagePath);
    const edited = 'Jamie de la Cruz-Williams';
    // Locate the existing slot by its public court label, not a new presentation class.
    const selector = '[aria-label="Court 1, top side, player 1"]';
    await page.locator('.svc').first().click();
    await page.locator(selector).fill(edited);
    await page.locator(selector).dispatchEvent('change');
    let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(saved.slots[0], edited, 'storage retains the unsplit original name');
    await page.reload();
    await page.waitForFunction(count => document.querySelectorAll('.registrant').length === count, names.length);
    assert.equal(await page.locator(selector).evaluate(el => el.value ?? el.innerText), edited);
    await page.locator('#complete-round').click();
    await page.locator('#previous-round').click();
    assert.equal(await page.locator(selector).evaluate(el => el.value ?? el.innerText), edited);
    assert.ok(await page.locator(selector).evaluate(el => el.readOnly || el.disabled || el.contentEditable === 'false'),
      'completed round slots are read-only');
    assert.ok(await page.locator('#shuffle').isDisabled());
    assert.ok(await page.locator('#complete-round').isDisabled());
    assert.ok(await page.locator('.registrant input').first().isDisabled());
    await page.locator('#next-round').click();
    await page.evaluate(() => { document.querySelector('#roster-panel').open = true; });
    await page.locator('.registrant input').first().setChecked(false);
    await page.locator('#shuffle').click();
    saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.deepEqual([...saved.slots.filter(Boolean)].sort(), names.slice(1).sort());
    assert.deepEqual(saved.activeRoster, names.slice(1));
    assert.equal(saved.completedRounds[0].slots[0], edited, 'shuffle must not change history');
  });
}

test('docs reset clears edited slots and history and restores its demo roster', async t => {
  const page = await openPage(t, 'docs/index.html');
  await page.locator('.svc').first().click();
  await page.locator('[aria-label="Court 1, top side, player 1"]').fill('Edited Player');
  await page.locator('#complete-round').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset-app').click();
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('roundRobinAssignment:v2'));
    return saved && saved.completedRounds.length === 0 && !saved.slots.includes('Edited Player');
  });
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.deepEqual([...saved.slots.filter(Boolean)].sort(), [...names].sort());
  assert.ok(await page.locator('#previous-round').isDisabled());
});

test('reusable court template supports larger multiline names', async t => {
  const page = await browser.newPage({ viewport: { width: 375, height: 1000 } });
  t.after(() => page.close());
  const html = await fs.readFile(path.join(__dirname, '../templates/court.html'), 'utf8');
  const css = await fs.readFile(path.join(__dirname, '../templates/court.css'), 'utf8');
  await page.setContent(`<style>* { box-sizing: border-box; } ${css}</style>${html}`);
  const presentation = await page.locator('.svc').first().evaluate(zone => ({
    size: Math.max(...[...zone.querySelectorAll('*')].map(el => parseFloat(getComputedStyle(el).fontSize))),
    singleLine: zone.children.length === 1 && zone.firstElementChild.tagName === 'INPUT' &&
      zone.firstElementChild.type === 'text',
  }));
  assert.equal(presentation.singleLine, false, 'template still uses a single-line name input');
  assert.ok(presentation.size > 15, `template name font is only ${presentation.size}px`);
});

// Optional baseline evidence, useful before the implementor changes anything.
test('capture desktop and mobile demo evidence', async t => {
  if (!process.env.NAME_TEST_EVIDENCE_DIR) return;
  await fs.mkdir(process.env.NAME_TEST_EVIDENCE_DIR, { recursive: true });
  for (const width of [1440, 375]) {
    const page = await openPage(t, 'docs/index.html', width);
    await page.evaluate(() => { document.querySelector('#roster-panel').open = true; });
    await page.screenshot({ path: path.join(process.env.NAME_TEST_EVIDENCE_DIR, `names-${width}.png`), fullPage: true });
  }
});
