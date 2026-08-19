(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RoundRobinScheduler = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function pairKey(a, b) {
    return JSON.stringify(a < b ? [a, b] : [b, a]);
  }

  function increment(map, a, b) {
    if (!a || !b || a === b) return;
    const key = pairKey(a, b);
    map.set(key, (map.get(key) || 0) + 1);
  }

  function relationshipHistory(rounds) {
    const partners = new Map();
    const opponents = new Map();
    for (const round of rounds || []) {
      const slots = Array.isArray(round) ? round : round && round.slots;
      if (!Array.isArray(slots)) continue;
      for (let offset = 0; offset < slots.length; offset += 4) {
        const teamA = slots.slice(offset, offset + 2).filter(Boolean);
        const teamB = slots.slice(offset + 2, offset + 4).filter(Boolean);
        if (teamA.length === 2) increment(partners, teamA[0], teamA[1]);
        if (teamB.length === 2) increment(partners, teamB[0], teamB[1]);
        for (const a of teamA) for (const b of teamB) increment(opponents, a, b);
      }
    }
    return { partners, opponents };
  }

  function shuffled(items, randomIndex) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function findFreshPartnerTeams(players, partnerHistory, randomIndex, nodeLimit) {
    let visited = 0;

    function search(remaining, teams) {
      if (++visited > nodeLimit) return null;
      if (remaining.length < 2) return remaining.length ? [...teams, [remaining[0]]] : teams;

      // Starting with the most constrained player makes a complete search practical
      // even late in a long event, when relatively few fresh partners remain.
      let selected = 0;
      let selectedOptions = null;
      for (let i = 0; i < remaining.length; i++) {
        const options = [];
        for (let j = 0; j < remaining.length; j++) {
          if (i !== j && !partnerHistory.has(pairKey(remaining[i], remaining[j]))) options.push(j);
        }
        if (selectedOptions === null || options.length < selectedOptions.length) {
          selected = i;
          selectedOptions = options;
        }
      }
      if (!selectedOptions.length) return null;

      const player = remaining[selected];
      for (const partnerIndex of shuffled(selectedOptions, randomIndex)) {
        const partner = remaining[partnerIndex];
        const next = remaining.filter((_, index) => index !== selected && index !== partnerIndex);
        const result = search(next, [...teams, [player, partner]]);
        if (result) return result;
      }
      return null;
    }

    if (players.length % 2 === 0) return search(players, []);
    // An odd field has one player without a partner. Try every choice so one
    // constrained player cannot prevent an otherwise valid assignment.
    for (const solo of shuffled(players, randomIndex)) {
      visited = 0;
      const result = search(players.filter(player => player !== solo), [[solo]]);
      if (result) return result;
    }
    return null;
  }

  function opponentCost(teamA, teamB, opponentHistory) {
    let cost = 0;
    for (const a of teamA) for (const b of teamB) cost += opponentHistory.get(pairKey(a, b)) || 0;
    return cost;
  }

  function arrangeCourts(teams, opponentHistory, randomIndex) {
    const memo = new Map();

    function solve(mask, allowSolo) {
      if (!mask) return { cost: 0, games: [] };
      const memoKey = `${mask}:${allowSolo}`;
      if (memo.has(memoKey)) return memo.get(memoKey);
      let first = 0;
      while (!(mask & (1 << first))) first++;
      const withoutFirst = mask & ~(1 << first);
      const choices = [];

      // Exactly one team may occupy a court alone when the team count is odd.
      if (allowSolo) {
        const rest = solve(withoutFirst, false);
        choices.push({ cost: rest.cost, games: [[teams[first]], ...rest.games] });
      }
      for (let other = first + 1; other < teams.length; other++) {
        if (!(withoutFirst & (1 << other))) continue;
        const rest = solve(withoutFirst & ~(1 << other), allowSolo);
        choices.push({
          cost: opponentCost(teams[first], teams[other], opponentHistory) + rest.cost,
          games: [[teams[first], teams[other]], ...rest.games],
        });
      }

      const minimum = Math.min(...choices.map(choice => choice.cost));
      const best = choices.filter(choice => choice.cost === minimum);
      const result = best[randomIndex(best.length)];
      memo.set(memoKey, result);
      return result;
    }

    return solve((1 << teams.length) - 1, (teams.length % 2) === 1);
  }

  function partnerRepeatCost(teams, partnerHistory) {
    return teams.reduce((cost, team) => cost + (
      team.length === 2 ? (partnerHistory.get(pairKey(team[0], team[1])) || 0) : 0
    ), 0);
  }

  function randomTeams(players, randomIndex) {
    const pool = shuffled(players, randomIndex);
    const teams = [];
    if (pool.length % 2) teams.push([pool.pop()]);
    while (pool.length) teams.push([pool.pop(), pool.pop()]);
    return teams;
  }

  function gamesToSlots(games, capacity, randomIndex) {
    const slots = [];
    for (const game of shuffled(games, randomIndex)) {
      const sides = game.length === 2 ? shuffled(game, randomIndex) : game;
      for (const team of sides) slots.push(team[0] || '', team[1] || '');
      if (sides.length === 1) slots.push('', '');
    }
    return slots.concat(Array(Math.max(0, capacity - slots.length)).fill('')).slice(0, capacity);
  }

  function scheduleRound(players, rounds, options = {}) {
    const capacity = options.capacity || 24;
    const randomIndex = options.randomIndex || (max => Math.floor(Math.random() * max));
    const activePlayers = [...new Set(players.filter(Boolean))].slice(0, capacity);
    const history = relationshipHistory(rounds);
    let best = null;

    // Sample multiple valid partner matchings, then choose the one whose court
    // arrangement introduces the fewest repeat opponents.
    const samples = options.samples || 160;
    for (let i = 0; i < samples; i++) {
      const teams = findFreshPartnerTeams(activePlayers, history.partners, randomIndex, 100000);
      if (!teams) break;
      const courts = arrangeCourts(teams, history.opponents, randomIndex);
      if (!best || courts.cost < best.opponentRepeats) {
        best = { teams, games: courts.games, partnerRepeats: 0, opponentRepeats: courts.cost };
        if (courts.cost === 0) break;
      }
    }

    // This is only needed after the available unique partnerships are exhausted.
    // Minimize repeats rather than refusing to create the next round.
    if (!best) {
      const attempts = options.fallbackSamples || 4000;
      for (let i = 0; i < attempts; i++) {
        const teams = randomTeams(activePlayers, randomIndex);
        const partnerRepeats = partnerRepeatCost(teams, history.partners);
        if (best && partnerRepeats > best.partnerRepeats) continue;
        const courts = arrangeCourts(teams, history.opponents, randomIndex);
        if (!best || partnerRepeats < best.partnerRepeats ||
            (partnerRepeats === best.partnerRepeats && courts.cost < best.opponentRepeats)) {
          best = { teams, games: courts.games, partnerRepeats, opponentRepeats: courts.cost };
        }
      }
    }

    if (!best) best = { games: [], partnerRepeats: 0, opponentRepeats: 0 };
    return {
      slots: gamesToSlots(best.games, capacity, randomIndex),
      partnerRepeats: best.partnerRepeats,
      opponentRepeats: best.opponentRepeats,
    };
  }

  return { relationshipHistory, scheduleRound };
});
