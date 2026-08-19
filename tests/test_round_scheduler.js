'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { relationshipHistory, scheduleRound } = require('../public/round_scheduler.js');

function seededRandom(seed = 1) {
  return max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };
}

function pairSet(rounds) {
  return relationshipHistory(rounds).partners;
}

test('relationship history records partners and cross-court opponents', () => {
  const history = relationshipHistory([{ slots: ['A', 'B', 'C', 'D'] }]);
  assert.equal(history.partners.get(JSON.stringify(['A', 'B'])), 1);
  assert.equal(history.partners.get(JSON.stringify(['C', 'D'])), 1);
  assert.equal(history.opponents.size, 4);
  assert.equal(history.opponents.get(JSON.stringify(['A', 'C'])), 1);
  assert.equal(history.opponents.get(JSON.stringify(['B', 'D'])), 1);
});

test('successive rounds do not repeat partners while fresh pairings exist', () => {
  const players = 'ABCDEFGH'.split('');
  const rounds = [];
  const randomIndex = seededRandom(42);

  for (let round = 0; round < players.length - 1; round++) {
    const previousPairs = pairSet(rounds);
    const result = scheduleRound(players, rounds, { capacity: 8, randomIndex, samples: 80 });
    assert.equal(result.partnerRepeats, 0, `round ${round + 1} repeated a partner`);
    for (let offset = 0; offset < result.slots.length; offset += 4) {
      for (const team of [result.slots.slice(offset, offset + 2), result.slots.slice(offset + 2, offset + 4)]) {
        assert.equal(previousPairs.has(JSON.stringify([...team].sort())), false);
      }
    }
    rounds.push({ slots: result.slots });
  }
});

test('repeat opponents are avoided when a zero-repeat arrangement is possible', () => {
  const players = 'ABCDEFGH'.split('');
  const randomIndex = seededRandom(7);
  const first = scheduleRound(players, [], { capacity: 8, randomIndex });
  const second = scheduleRound(players, [{ slots: first.slots }], { capacity: 8, randomIndex });

  assert.equal(second.partnerRepeats, 0);
  assert.equal(second.opponentRepeats, 0);
});

test('an odd roster leaves exactly one team without opponents', () => {
  const players = ['A', 'B', 'C', 'D', 'E'];
  const result = scheduleRound(players, [], { capacity: 8, randomIndex: seededRandom(11) });
  const occupiedCourts = [result.slots.slice(0, 4), result.slots.slice(4, 8)]
    .map(court => court.filter(Boolean).length)
    .sort();

  assert.deepEqual(occupiedCourts, [1, 4]);
  assert.deepEqual(result.slots.filter(Boolean).sort(), players);
});

test('a round is still produced when all partnerships have been exhausted', () => {
  const players = ['A', 'B', 'C', 'D'];
  const rounds = [
    { slots: ['A', 'B', 'C', 'D'] },
    { slots: ['A', 'C', 'B', 'D'] },
    { slots: ['A', 'D', 'B', 'C'] },
  ];
  const result = scheduleRound(players, rounds, {
    capacity: 4,
    randomIndex: seededRandom(99),
    samples: 20,
    fallbackSamples: 100,
  });

  assert.deepEqual([...result.slots].sort(), players);
  assert.equal(result.partnerRepeats, 2);
});
