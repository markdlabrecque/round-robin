'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { relationshipHistory, scheduleRound } = require('../round_scheduler.js');

function sessionRandom(seed) {
  return max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return Math.floor(seed / 4294967296 * max);
  };
}

test('squared opponent cost prefers spreading reuse when linear totals tie', () => {
  const players = 'ABCDEFGH'.split('');
  const rounds = 'EGHAFDCB GCFHBDAE DAECHFGB DEFCGBHA'
    .split(' ').map(slots => ({ slots: slots.split('') }));
  for (const round of rounds) assert.deepEqual([...round.slots].sort(), players);
  const prior = relationshipHistory(rounds);

  function usage(slots) {
    assert.equal(slots.length, 8);
    assert.deepEqual([...slots].sort(), players);
    const selected = relationshipHistory([{ slots }]);
    for (const pair of selected.partners.keys()) {
      assert.equal(prior.partners.has(pair), false, `reused partnership ${pair}`);
    }
    return [...selected.opponents.keys()].map(pair => prior.opponents.get(pair) || 0);
  }

  const total = counts => counts.reduce((sum, count) => sum + count, 0);
  const squaredCost = counts => counts.reduce((sum, count) => sum + count * count, 0);
  // Both arrangements use fresh partners and six prior opponent meetings.
  // The concentrated one selects two twice-used opponent pairs instead of one.
  const spread = usage('EFGHABCD'.split(''));
  const concentrated = usage('CHAFDGBE'.split(''));
  assert.deepEqual([...spread].sort(), [0, 0, 0, 1, 1, 1, 1, 2]);
  assert.deepEqual([...concentrated].sort(), [0, 0, 0, 0, 1, 1, 2, 2]);
  assert.equal(total(spread), 6);
  assert.equal(total(concentrated), 6);
  assert.equal(squaredCost(spread), 8);
  assert.equal(squaredCost(concentrated), 10);

  const result = scheduleRound(players, rounds, {
    capacity: 8,
    randomIndex: sessionRandom(1),
  });
  const selected = usage(result.slots);
  assert.ok(total(selected) <= 6);
  assert.ok(squaredCost(selected) <= squaredCost(spread),
    `selected prior opponent counts ${JSON.stringify(selected)} despite cost-8 alternative`);
});
