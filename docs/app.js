const COURT_COUNT = 6;
  const CAPACITY = COURT_COUNT * 4;
  const STORAGE_KEY = 'roundRobinAssignment:v2';
  const courts = document.getElementById('courts');
  const registrationFile = document.getElementById('registration-file');
  const registrationFileLabel = document.getElementById('registration-file-label');
  const shuffleButton = document.getElementById('shuffle');
  const completeRoundButton = document.getElementById('complete-round');
  const previousRoundButton = document.getElementById('previous-round');
  const nextRoundButton = document.getElementById('next-round');
  const roundLabel = document.getElementById('round');
  const roundPosition = document.getElementById('round-position');
  const status = document.getElementById('status');
  const playerCount = document.getElementById('player-count');
  const rosterPanel = document.getElementById('roster-panel');
  const rosterSummary = document.getElementById('roster-summary');
  const registrantList = document.getElementById('registrant-list');
  const addPlayerButton = document.getElementById('add-player');
  const resetButton = document.getElementById('reset-app');
  let roster = [];
  let activeRoster = [];
  let activeSlots = Array(CAPACITY).fill('');
  let completedRounds = [];
  let viewedRound = 0;
  let importInProgress = false;
  let initializationSettled = false;
  let completingRound = false;

  for (let i = 1; i <= COURT_COUNT; i++) {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-head">
        <span class="court-name">Court ${i}</span>
        <span class="court-no">Doubles</span>
      </div>
      <div class="side-label">Team A</div>
      <div class="court">
        <div class="zone svc tl"><input class="player" type="text" placeholder="Player 1" aria-label="Court ${i}, top side, player 1"></div>
        <div class="zone svc tr"><input class="player" type="text" placeholder="Player 2" aria-label="Court ${i}, top side, player 2"></div>
        <div class="zone kitchen near"></div>
        <div class="zone kitchen far"></div>
        <div class="zone svc bl"><input class="player" type="text" placeholder="Player 3" aria-label="Court ${i}, bottom side, player 1"></div>
        <div class="zone svc br"><input class="player" type="text" placeholder="Player 4" aria-label="Court ${i}, bottom side, player 2"></div>
        <div class="net"></div>
      </div>
      <div class="side-label">Team B</div>
    `;
    courts.appendChild(card);
  }

  const playerInputs = [...document.querySelectorAll('.player')];

  function randomIndex(maxExclusive) {
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * maxExclusive);
    const range = 0x100000000;
    const limit = range - (range % maxExclusive);
    const value = new Uint32Array(1);
    do window.crypto.getRandomValues(value); while (value[0] >= limit);
    return value[0] % maxExclusive;
  }

  let scriptRoster = [];
  let scriptRosterKey = '';

  function isViewingActiveRound() {
    return viewedRound === completedRounds.length;
  }

  function selectedRoster() {
    return [...registrantList.querySelectorAll('input:checked')].map(input => input.value);
  }

  function captureActiveRound() {
    if (!isViewingActiveRound()) return;
    activeRoster = selectedRoster();
    activeSlots = playerInputs.map(input => input.value);
  }

  function updateRosterSummary(locked = !isViewingActiveRound()) {
    const playing = selectedRoster().length;
    rosterSummary.textContent = `Players (${roster.length}) — ${playing} playing${locked ? ' — locked' : ''}`;
  }

  function renderRosterChecklist(selectedNames = roster, rosterNames = roster, locked = false) {
    const selected = new Set(selectedNames);
    registrantList.replaceChildren();
    for (const name of rosterNames) {
      const label = document.createElement('label');
      label.className = 'registrant';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = name;
      checkbox.checked = selected.has(name);
      checkbox.disabled = locked;
      checkbox.setAttribute('aria-label', `${name} is playing`);
      const text = document.createElement('span');
      text.textContent = name;
      label.append(checkbox, text);
      registrantList.appendChild(label);
    }
    rosterPanel.hidden = rosterNames.length === 0;
    updateRosterSummary(locked);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scriptRosterKey,
        roster,
        activeRoster,
        slots: activeSlots,
        completedRounds,
      }));
    } catch (error) {
      console.warn('Court assignments could not be saved:', error);
    }
  }

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function syncControls() {
    const active = isViewingActiveRound();
    const editable = initializationSettled && active && !importInProgress;
    const hasPlayers = activeRoster.length > 0;
    registrationFile.disabled = !editable;
    registrationFileLabel.classList.toggle('disabled', !editable);
    registrationFileLabel.setAttribute('aria-disabled', String(!editable));
    shuffleButton.disabled = !editable || !hasPlayers;
    addPlayerButton.disabled = !editable;
    completeRoundButton.disabled = !editable || !hasPlayers || completingRound;
    previousRoundButton.disabled = importInProgress || viewedRound === 0;
    nextRoundButton.disabled = importInProgress || viewedRound === completedRounds.length;
    playerInputs.forEach(input => { input.readOnly = !editable; });
    roundLabel.textContent = `Round ${viewedRound + 1}`;
    const roundState = document.createElement('span');
    roundState.className = 'round-state';
    roundState.textContent = `(${active ? 'Current' : 'Completed'})`;
    roundPosition.replaceChildren(document.createTextNode(`Round ${viewedRound + 1} `), roundState);
  }

  function updateStatus(message = 'assigned') {
    const assigned = playerInputs.filter(input => input.value.trim()).length;
    const overflow = Math.max(0, selectedRoster().length - CAPACITY);
    playerCount.textContent = `${assigned} / ${CAPACITY} players`;
    status.className = 'status';
    status.textContent = overflow
      ? `${assigned} players ${message}; ${overflow} could not fit on six courts.`
      : '';
    updateRosterSummary(false);
    syncControls();
  }

  function renderRound() {
    const active = isViewingActiveRound();
    const round = active
      ? { roster, activeRoster, slots: activeSlots }
      : completedRounds[viewedRound];
    renderRosterChecklist(round.activeRoster, round.roster, !active);
    playerInputs.forEach((input, index) => { input.value = round.slots[index] ?? ''; });
    const assigned = round.slots.filter(name => name.trim()).length;
    playerCount.textContent = `${assigned} / ${CAPACITY} players`;
    status.className = 'status';
    status.textContent = active
      ? ''
      : `Round ${viewedRound + 1} completed with ${assigned} player${assigned === 1 ? '' : 's'}.`;
    syncControls();
  }

  function assignRoster() {
    if (!isViewingActiveRound()) return;
    activeRoster = selectedRoster();
    const assignment = RoundRobinScheduler.scheduleRound(activeRoster, completedRounds, {
      capacity: CAPACITY,
      randomIndex,
    });
    playerInputs.forEach((input, index) => { input.value = assignment.slots[index] ?? ''; });
    activeSlots = playerInputs.map(input => input.value);
    updateStatus();
    if (assignment.partnerRepeats) {
      status.textContent += ` ${assignment.partnerRepeats} repeat partnership${assignment.partnerRepeats === 1 ? '' : 's'} could not be avoided.`;
    }
    saveState();
  }

  function parseRoster(data) {
    if (!data || !Array.isArray(data.registrants)) {
      throw new Error('Expected a JSON object with a “registrants” array.');
    }
    const unique = new Map();
    for (const item of data.registrants) {
      if (!item || typeof item.name !== 'string') {
        throw new Error('Each registrant must have a name string.');
      }
      const name = item.name.trim();
      if (!name) throw new Error('Registrant names cannot be empty.');
      const key = name.toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, name);
    }
    return [...unique.values()];
  }

  shuffleButton.addEventListener('click', assignRoster);
  registrationFile.addEventListener('change', importRegistrationFile);
  registrantList.addEventListener('change', event => {
    if (isViewingActiveRound() && event.target.matches('input[type="checkbox"]')) assignRoster();
  });
  addPlayerButton.addEventListener('click', () => {
    const name = window.prompt('Player name:')?.trim();
    if (!name) return;
    if (roster.some(player => player.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      status.className = 'status error';
      status.textContent = `${name} is already in the player list.`;
      return;
    }
    const selectedPlayers = selectedRoster();
    roster.push(name);
    activeRoster = [...selectedPlayers, name];
    renderRosterChecklist(activeRoster);
    assignRoster();
  });

  completeRoundButton.addEventListener('click', () => {
    if (!isViewingActiveRound() || !activeRoster.length || completingRound) return;
    completingRound = true;
    syncControls();
    captureActiveRound();
    completedRounds.push({
      roster: [...roster],
      activeRoster: [...activeRoster],
      slots: [...activeSlots],
    });
    viewedRound = completedRounds.length;
    activeSlots = Array(CAPACITY).fill('');
    renderRound();
    assignRoster();
    window.setTimeout(() => {
      completingRound = false;
      syncControls();
    }, 500);
  });

  previousRoundButton.addEventListener('click', () => {
    if (viewedRound === 0) return;
    captureActiveRound();
    viewedRound -= 1;
    renderRound();
    saveState();
  });

  nextRoundButton.addEventListener('click', () => {
    if (viewedRound >= completedRounds.length) return;
    viewedRound += 1;
    renderRound();
  });

  resetButton.addEventListener('click', () => {
    const confirmed = window.confirm('Reset the app? This clears all saved court assignments and round history in this browser.');
    if (!confirmed) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Could not clear saved state:', error);
    }
    window.location.reload();
  });

  async function importRegistrationFile() {
    if (!initializationSettled) return;
    const file = registrationFile.files[0];
    if (!file) return;
    if (!RegistrationImport.isRegistrationHtmlFile(file)) {
      status.className = 'status error';
      status.textContent = 'Choose a saved registration email with a .html or .htm extension.';
      registrationFile.value = '';
      return;
    }

    const previousStatus = { className: status.className, textContent: status.textContent };
    importInProgress = true;
    syncControls();
    try {
      const names = RegistrationEmailParser.parseRegistrationEmail(await file.text());
      const result = RegistrationImport.replaceRoster({
        roster,
        activeRoster,
        activeSlots,
        completedRounds,
        viewedRound,
      }, names, CAPACITY, () => window.confirm(
        'Importing this roster will discard the current court assignments and round history. Continue?'
      ));
      if (result.status === 'disabled') {
        status.className = 'status error';
        status.textContent = 'Import is unavailable while viewing a completed round.';
        return;
      }
      if (result.status === 'cancelled') {
        status.className = previousStatus.className;
        status.textContent = previousStatus.textContent;
        return;
      }

      ({ roster, activeRoster, activeSlots, completedRounds, viewedRound } = result.state);
      renderRound();
      assignRoster();
      status.className = 'status';
      status.textContent = RegistrationImport.importStatusMessage(names.length, CAPACITY);
      saveState();
    } catch (error) {
      status.className = 'status error';
      status.textContent = `Could not import ${file.name}: ${error.message}`;
    } finally {
      importInProgress = false;
      registrationFile.value = '';
      syncControls();
    }
  }

  playerInputs.forEach(input => {
    input.addEventListener('input', () => {
      if (!isViewingActiveRound()) return;
      activeSlots = playerInputs.map(playerInput => playerInput.value);
      saveState();
    });
    input.addEventListener('change', () => {
      if (!isViewingActiveRound()) return;
      activeSlots = playerInputs.map(playerInput => playerInput.value);
      updateStatus('saved');
      saveState();
    });
  });

  function isStringArray(value, expectedLength = null) {
    return Array.isArray(value) &&
      (expectedLength === null || value.length === expectedLength) &&
      value.every(item => typeof item === 'string');
  }

  async function initializeDemo() {
    try {
      const response = await fetch('./registrants.json?v=2', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load demo roster (${response.status}).`);
      scriptRoster = parseRoster(await response.json());
      scriptRosterKey = JSON.stringify(scriptRoster);

      const savedState = readState();
      if (
        savedState &&
        savedState.scriptRosterKey === scriptRosterKey &&
        isStringArray(savedState.roster) &&
        isStringArray(savedState.slots, CAPACITY)
      ) {
        roster = savedState.roster;
        activeRoster = isStringArray(savedState.activeRoster) ? savedState.activeRoster : roster;
        activeSlots = savedState.slots;
        completedRounds = Array.isArray(savedState.completedRounds)
          ? savedState.completedRounds.filter(round =>
              round &&
              isStringArray(round.roster) &&
              isStringArray(round.activeRoster) &&
              isStringArray(round.slots, CAPACITY)
            )
          : [];
        viewedRound = completedRounds.length;
        renderRound();
        if (roster.length) updateStatus('restored');
      } else {
        roster = scriptRoster;
        activeRoster = [...roster];
        activeSlots = Array(CAPACITY).fill('');
        viewedRound = 0;
        renderRound();
        assignRoster();
      }
    } catch (error) {
      status.className = 'status error';
      status.textContent = `Could not start the demo: ${error.message}`;
    } finally {
      initializationSettled = true;
      syncControls();
    }
  }

  syncControls();
  initializeDemo();
