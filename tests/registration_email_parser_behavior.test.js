'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseRegistrationEmail } = require('../docs/registration_email_parser.js');

test('imports the nested candidate table from the saved registration email', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sample.html'), 'utf8');

  assert.deepEqual(parseRegistrationEmail(html), [
    'Kristina Norvell', 'Oona Kerwin', 'Tracey Greason', 'Susan Hingson',
    'Toni Crickmore-Thompson', 'Dan Hogan', 'Eric Kerwin', 'Lisa Hogan',
    'Doug White', 'Alasdair Burns', 'Juan Carlos Sarmiento', 'Gordon Yuen',
    'Lauren Mitchell', 'Steve Cook', 'Gordon Lee', 'David Whittle',
    'Karen Wilson', 'Ivan Levchenko', 'Joanne Miller', 'Brenda Wellington',
    'Trevor Stich', 'Brenda Stich', 'Tina Faulkner', 'Mike McLean',
  ]);
});

test('accepts standard omitted table cell and row end tags', () => {
  const html = '<table><tr><td>Ada<td>Lovelace<tr><td>Grace<td>Hopper</table>';

  assert.deepEqual(parseRegistrationEmail(html), ['Ada Lovelace', 'Grace Hopper']);
});

test('decodes numeric entities in registration names', () => {
  const html = '<table><tr><td>Zo&#235;</td><td>Bront&#235;</td></tr></table>';

  assert.deepEqual(parseRegistrationEmail(html), ['Zoë Brontë']);
});

test('decodes named entities in registration names', () => {
  const html = '<table><tr><td>Andr&eacute;</td><td>Garc&iacute;a</td></tr></table>';

  assert.deepEqual(parseRegistrationEmail(html), ['André García']);
});

test('uses an injected full HTML entity decoder for registration names', () => {
  const html = '<table><tr><td>A&CounterClockwiseContourIntegral;</td><td>B&NotEqualTilde;</td></tr></table>';
  const decodedValues = [];

  const names = parseRegistrationEmail(html, {
    decodeEntities(value) {
      decodedValues.push(value);
      return value
        .replaceAll('&CounterClockwiseContourIntegral;', '∳')
        .replaceAll('&NotEqualTilde;', '≂̸');
    },
  });

  assert.deepEqual(names, ['A∳ B≂̸']);
  assert.deepEqual(decodedValues, ['A&CounterClockwiseContourIntegral;', 'B&NotEqualTilde;']);
});

test('uses only direct row cells and ignores nested wrapper tables and scripts', () => {
  const html = `
    <table><tr><td>Unrelated wrapper text</td><td>Ignore me</td></tr>
      <tr><td><table>
        <tr><td>Ada</td><td>Lovelace</td></tr>
        <tr><td>Grace</td><td>Hopper</td></tr>
      </table></td><td>Nested table wrapper</td></tr>
    </table>
    <script>window.untrusted = '<table><tr><td>Not</td><td>A Name</td></tr></table>';</script>`;

  assert.deepEqual(parseRegistrationEmail(html), ['Ada Lovelace', 'Grace Hopper']);
});

test('rejects malformed, missing, and ambiguous registration listings', () => {
  assert.throws(
    () => parseRegistrationEmail('<table><tr><td>Ada</td><td>Lovelace</td></tr>'),
    /malformed HTML/,
  );
  assert.throws(
    () => parseRegistrationEmail('<p>There is no registration table in this email.</p>'),
    /No registration listing table/,
  );
  assert.throws(
    () => parseRegistrationEmail(`
      <table><tr><td>Ada</td><td>Lovelace</td></tr></table>
      <table><tr><td>Grace</td><td>Hopper</td></tr></table>`),
    /Ambiguous registration listing tables/,
  );
});

test('normalizes cell text and preserves the first case-insensitive occurrence', () => {
  const html = `
    <table><tbody>
      <tr><td><p>  José&nbsp; María </p></td><td> O&#39;Neil &amp; Sons </td></tr>
      <tr><td>josé maría</td><td>o'neil &amp; sons</td></tr>
      <tr><td>Jean-Luc</td><td>  d'Arc  </td></tr>
    </tbody></table>`;

  assert.deepEqual(parseRegistrationEmail(html), [
    "José María O'Neil & Sons",
    "Jean-Luc d'Arc",
  ]);
});
