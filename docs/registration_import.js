(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RegistrationImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isRegistrationHtmlFile(file) {
    return Boolean(file && typeof file.name === 'string' && /\.html?$/i.test(file.name));
  }

  function importStatusMessage(playerCount, capacity) {
    const overflow = Math.max(0, playerCount - capacity);
    const courtCount = capacity / 4;
    const courtCountLabel = courtCount === 6 ? 'six' : courtCount;
    return `Imported ${playerCount} player${playerCount === 1 ? '' : 's'}.` +
      (overflow ? ` ${overflow} could not fit on ${courtCountLabel} court${courtCount === 1 ? '' : 's'}.` : '');
  }

  function replaceRoster(state, names, capacity, confirmDiscard = () => false) {
    if (state.viewedRound !== state.completedRounds.length) return { status: 'disabled', state };
    const discardsCurrentState = state.activeSlots.some(name => name.trim()) || state.completedRounds.length > 0;
    if (discardsCurrentState && !confirmDiscard()) {
      return { status: 'cancelled', state };
    }
    return {
      status: 'imported',
      state: {
        roster: [...names],
        activeRoster: [...names],
        activeSlots: Array(capacity).fill(''),
        completedRounds: [],
        viewedRound: 0,
      },
    };
  }

  return { importStatusMessage, isRegistrationHtmlFile, replaceRoster };
});
