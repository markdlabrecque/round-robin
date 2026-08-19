'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('parses names from a registration listing table fragment', () => {
  const { parseRegistrationEmail } = require('../public/registration_email_parser.js');
  const listing = `
    <table>
      <tbody>
        <tr><td><p>Ada</p></td><td><p>Lovelace</p></td></tr>
        <tr><td><p>Grace</p></td><td><p>Hopper</p></td></tr>
      </tbody>
    </table>`;

  assert.deepEqual(parseRegistrationEmail(listing), ['Ada Lovelace', 'Grace Hopper']);
});
