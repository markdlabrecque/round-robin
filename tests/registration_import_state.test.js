'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { importStatusMessage, isRegistrationHtmlFile, replaceRoster } = require('../public/registration_import.js');

const emptyState = {
  roster: [],
  activeRoster: [],
  activeSlots: Array(24).fill(''),
  completedRounds: [],
  viewedRound: 0,
};

test('reports imported players and overflow without dropping the roster', () => {
  assert.equal(importStatusMessage(1, 24), 'Imported 1 player.');
  assert.equal(importStatusMessage(25, 24), 'Imported 25 players. 1 could not fit on six courts.');
});

test('accepts HTML files and replaces an empty active roster', () => {
  assert.equal(isRegistrationHtmlFile({ name: 'registrations.html' }), true);
  assert.equal(isRegistrationHtmlFile({ name: 'registrations.HTM' }), true);
  assert.equal(isRegistrationHtmlFile({ name: 'registrations.txt' }), false);

  const result = replaceRoster(emptyState, ['Ada Lovelace', 'Grace Hopper'], 24, () => {
    throw new Error('Confirmation is not needed for an empty round.');
  });

  assert.equal(result.status, 'imported');
  assert.deepEqual(result.state, {
    roster: ['Ada Lovelace', 'Grace Hopper'],
    activeRoster: ['Ada Lovelace', 'Grace Hopper'],
    activeSlots: Array(24).fill(''),
    completedRounds: [],
    viewedRound: 0,
  });
});

test('keeps state unchanged when a destructive import is declined', () => {
  const state = {
    roster: ['Existing Player'],
    activeRoster: ['Existing Player'],
    activeSlots: ['Existing Player', ...Array(23).fill('')],
    completedRounds: [{ slots: ['Existing Player', ...Array(23).fill('')] }],
    viewedRound: 1,
  };
  let confirmations = 0;

  const result = replaceRoster(state, ['Ada Lovelace'], 24, () => {
    confirmations++;
    return false;
  });

  assert.equal(confirmations, 1);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.state, state);
});

test('refuses imports while a completed round is being viewed', () => {
  const state = {
    roster: ['Existing Player'],
    activeRoster: ['Existing Player'],
    activeSlots: Array(24).fill(''),
    completedRounds: [{ slots: ['Existing Player', ...Array(23).fill('')] }],
    viewedRound: 0,
  };

  const result = replaceRoster(state, ['Ada Lovelace'], 24, () => true);

  assert.equal(result.status, 'disabled');
  assert.equal(result.state, state);
});
