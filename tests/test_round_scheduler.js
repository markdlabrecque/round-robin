'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { relationshipHistory, scheduleRound } = require('../round_scheduler.js');

function seededRandom(seed = 1) {
  return max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };
}

function pairSet(rounds) {
  return relationshipHistory(rounds).partners;
}

// Use the whole PRNG word, avoiding the LCG's alternating low bit during shuffles.
function sessionRandom(seed) {
  return max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return Math.floor(seed / 4294967296 * max);
  };
}

function roundsFromSlots(slots) {
  return slots.split(' ').map(round => ({ slots: round.split('') }));
}

function allPairCounts(players, counts) {
  return players.flatMap((a, index) => players.slice(index + 1).map(b =>
    counts.get(JSON.stringify([a, b].sort())) || 0
  ));
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

test('a full session spreads opponent reuse through two partnership cycles', () => {
  const players = 'ABCDEFGH'.split('');
  // A feasible session for this small roster, not an arbitrary-roster optimality claim.
  const balancedSession = roundsFromSlots(
    'DFAHBGCE BFDGCHAE FHBCEGAD DECFAGBH EFABCGDH GHBECDAF ACFGEHBD ' +
    'GFEHBADC FAGBDHEC ADBHCFEG FBHCAGED CGHAEFDB EAFHBCDG FDGHBECA'
  );
  const witness = relationshipHistory(balancedSession);
  assert.deepEqual(allPairCounts(players, witness.partners), Array(28).fill(2));
  assert.deepEqual(allPairCounts(players, witness.opponents), Array(28).fill(4));

  const rounds = [];
  const randomIndex = sessionRandom(7);
  for (let round = 0; round < 14; round++) {
    const previous = pairSet(rounds);
    const result = scheduleRound(players, rounds, { capacity: 8, randomIndex });
    assert.equal(result.slots.length, 8);
    assert.deepEqual([...result.slots].sort(), players);
    const selected = pairSet([{ slots: result.slots }]);
    if (round < 7) {
      for (const pair of selected.keys()) {
        assert.equal(previous.has(pair), false, `round ${round + 1} repeated ${pair}`);
      }
    }
    rounds.push({ slots: [...result.slots] });
  }

  const history = relationshipHistory(rounds);
  assert.deepEqual(allPairCounts(players, history.partners), Array(28).fill(2));
  const opponents = allPairCounts(players, history.opponents);
  assert.ok(Math.max(...opponents) <= 4,
    `opponent reuse concentrated after 14 rounds: ${JSON.stringify(opponents)}`);
});

test('exhausted partnerships do not select a third-use pair over second-use alternatives', () => {
  const players = 'ABCDEFGH'.split('');
  const rounds = roundsFromSlots(
    'GHADCEBF DGCFAHBE BHFGCDAE AGEFDHBC DEFHABCG ACFDBGEH EGCHAFBD ' +
    'DFGBAHEC CADBEHFG CHEADFGB ADCBEGFH ABEHCFDG FEGACHBD DCHGABEF ' +
    'HBEFCGAD DAEHFCGB FBDAGCEH'
  );
  const prior = pairSet(rounds);
  assert.equal(prior.size, 28, 'every possible partnership must already be used');

  const usage = slots => [...pairSet([{ slots }]).keys()].map(pair => prior.get(pair) || 0);
  // Both schedules reuse six prior partnerships in total, but this one avoids
  // concentrating repeats on a pair already used three times.
  const alternative = 'ACBEDHFG'.split('');
  assert.deepEqual([...alternative].sort(), players);
  assert.deepEqual(usage(alternative), [2, 1, 1, 2]);

  const result = scheduleRound(players, rounds, {
    capacity: 8,
    randomIndex: sessionRandom(99),
  });
  assert.equal(result.slots.length, 8);
  assert.deepEqual([...result.slots].sort(), players);
  const selectedUsage = usage(result.slots);
  assert.ok(selectedUsage.reduce((sum, count) => sum + count, 0) <= 6);
  assert.ok(Math.max(...selectedUsage) <= 2,
    `selected prior partnership counts ${JSON.stringify(selectedUsage)} despite [2,1,1,2] alternative`);
});
