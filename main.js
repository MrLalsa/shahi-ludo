/**
 * Shahi Ludo — main. Wires lobby UI, networking, the rules engine and the
 * renderer together. The HOST always runs game-engine.js as the source of
 * truth; the GUEST only sends intents and renders whatever the host sends.
 */
(function () {
  'use strict';

  // ---- DOM refs -----------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const el = {
    screenLobby: $('#screen-lobby'),
    screenGame: $('#screen-game'),

    lobbyLanding: $('#lobby-landing'),
    nameInput: $('#player-name'),
    btnGoCreate: $('#btn-go-create'),
    btnGoJoin: $('#btn-go-join'),

    createSetup: $('#lobby-create-setup'),
    createColorGrid: $('#create-color-grid'),
    btnCreateRoom: $('#btn-create-room'),
    btnBackFromCreate: $('#btn-back-from-create'),

    hostingWait: $('#lobby-hosting-wait'),
    roomCodeText: $('#room-code-text'),
    btnCopyLink: $('#btn-copy-link'),
    copyFeedback: $('#copy-feedback'),

    joinEnter: $('#lobby-join-enter-code'),
    roomCodeInput: $('#room-code-input'),
    btnConnect: $('#btn-connect'),
    btnBackFromJoinEnter: $('#btn-back-from-join-enter'),
    joinEnterError: $('#join-enter-error'),

    joinConnecting: $('#lobby-join-connecting'),

    joinSetup: $('#lobby-join-setup'),
    joinColorGrid: $('#join-color-grid'),
    btnJoinGame: $('#btn-join-game'),

    lobbyErrorBox: $('#lobby-error-box'),

    badge0: $('#badge-player-0'),
    badge1: $('#badge-player-1'),
    boardGrid: $('#board-grid'),
    boardInner: $('#board-inner'),
    tokensLayer: $('#tokens-layer'),
    fxLayer: $('#fx-layer'),
    diceWrap: $('#dice-3d-wrap'),
    diceCube: $('#dice-3d'),
    statusMessage: $('#status-message'),
    btnMute: $('#btn-mute'),
    btnLeave: $('#btn-leave'),

    modalWin: $('#modal-win'),
    winTitle: $('#win-title'),
    winSub: $('#win-sub'),
    btnNewGame: $('#btn-new-game'),

    modalGone: $('#modal-disconnect'),
    goneText: $('#disconnect-text'),
    btnGoneOk: $('#btn-disconnect-ok'),
  };

  const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];

  // ---- App state ------------------------------------------------------------
  const app = {
    net: new LudoNetwork(),
    isHost: false,
    myColor: null,
    myName: '',
    peerName: '',
    roomId: null,
    state: null,           // current game state (mirrored on both sides)
    boardRenderer: null,
    diceRenderer: null,
    animating: false,      // guards against double-processing while a hop animation runs
  };

  try {
    const savedName = localStorage.getItem('shahiLudoName');
    if (savedName) el.nameInput.value = savedName;
  } catch (e) { /* localStorage unavailable, fine */ }

  // ---- Lobby step navigation -------------------------------------------------
  function showLobbyStep(stepEl) {
    [el.lobbyLanding, el.createSetup, el.hostingWait, el.joinEnter, el.joinConnecting, el.joinSetup]
      .forEach(s => s.hidden = (s !== stepEl));
  }

  function validatedName() {
    const n = el.nameInput.value.trim().slice(0, 18);
    return n || 'Player';
  }

  el.btnGoCreate.addEventListener('click', () => {
    app.myName = validatedName();
    try { localStorage.setItem('shahiLudoName', app.myName); } catch (e) {}
    buildColorGrid(el.createColorGrid, []);
    showLobbyStep(el.createSetup);
  });

  el.btnGoJoin.addEventListener('click', () => {
    app.myName = validatedName();
    try { localStorage.setItem('shahiLudoName', app.myName); } catch (e) {}
    el.joinEnterError.textContent = '';
    if (window.__prefillRoom) {
      el.roomCodeInput.value = window.__prefillRoom;
      connectToRoom(window.__prefillRoom);
    } else {
      showLobbyStep(el.joinEnter);
    }
  });

  el.btnBackFromCreate.addEventListener('click', () => showLobbyStep(el.lobbyLanding));
  el.btnBackFromJoinEnter.addEventListener('click', () => showLobbyStep(el.lobbyLanding));

  // ---- Color pickers ----------------------------------------------------------
  function buildColorGrid(container, takenColors) {
    container.innerHTML = '';
    let selected = COLOR_ORDER.find(c => !takenColors.includes(c));
    COLOR_ORDER.forEach(color => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch';
      sw.dataset.color = color;
      if (takenColors.includes(color)) sw.classList.add('taken');
      if (color === selected) sw.classList.add('selected');
      sw.addEventListener('click', () => {
        if (sw.classList.contains('taken')) return;
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        selected = color;
      });
      container.appendChild(sw);
    });
    container.getSelected = () => selected;
  }

  // ---- Create / host flow -------------------------------------------------------
  el.btnCreateRoom.addEventListener('click', () => {
    app.myColor = el.createColorGrid.getSelected();
    app.isHost = true;
    setupNetworkHandlers();
    app.net.hostGame();
    showLobbyStep(el.hostingWait);
    el.roomCodeText.textContent = 'Creating room…';
  });

  el.btnCopyLink.addEventListener('click', async () => {
    const link = shareLink(app.roomId);
    try {
      await navigator.clipboard.writeText(link);
      el.copyFeedback.textContent = 'Link copied — send it to your friend!';
    } catch (e) {
      el.copyFeedback.textContent = link;
    }
    setTimeout(() => { el.copyFeedback.textContent = ''; }, 4000);
  });

  // ---- Join flow ----------------------------------------------------------------
  el.btnConnect.addEventListener('click', () => {
    const code = el.roomCodeInput.value.trim();
    if (!code) { el.joinEnterError.textContent = 'Enter a room code first.'; return; }
    connectToRoom(code);
  });

  function connectToRoom(code) {
    app.isHost = false;
    setupNetworkHandlers();
    showLobbyStep(el.joinConnecting);
    app.net.joinGame(code);
  }

  el.btnJoinGame.addEventListener('click', () => {
    app.myColor = el.joinColorGrid.getSelected();
    app.net.send({ type: 'guest-ready', color: app.myColor, name: app.myName });
  });

  // pre-fill room code from ?room= link (this script runs at the end of
  // body, after the DOM is already parsed, so we act immediately here
  // rather than waiting on a DOMContentLoaded that has already fired)
  (function checkUrlRoom() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      window.__prefillRoom = room;
      el.roomCodeInput.value = room;
      const hint = document.createElement('p');
      hint.className = 'hint-text';
      hint.style.textAlign = 'center';
      hint.textContent = `You've been invited to a game — enter your name and tap "Join Game".`;
      el.lobbyLanding.insertBefore(hint, el.btnGoCreate.parentElement);
      el.btnGoCreate.style.display = 'none'; // an invite link implies joining, not hosting
    }
  })();

  // ---- Network wiring -------------------------------------------------------------
  function setupNetworkHandlers() {
    app.net.onOpen = (roomId) => {
      app.roomId = roomId;
      const shortCode = roomId.replace(ROOM_ID_PREFIX, '');
      el.roomCodeText.textContent = shortCode;
    };

    app.net.onPeerConnected = () => {
      if (app.isHost) {
        app.net.send({ type: 'lobby-info', hostColor: app.myColor, hostName: app.myName });
      } else {
        buildColorGrid(el.joinColorGrid, []); // updated once lobby-info arrives
        showLobbyStep(el.joinConnecting); // still show spinner until lobby-info lands
      }
    };

    app.net.onMessage = (msg) => handleMessage(msg);

    app.net.onDisconnected = () => {
      if (el.screenGame.classList.contains('active') && !(app.state && app.state.phase === 'over')) {
        showGoneModal('Your friend disconnected. You can start a fresh game from the lobby.');
      }
    };

    app.net.onError = (err) => {
      const msg = (err && err.type) || 'connection-error';
      if (!app.isHost && (msg === 'peer-unavailable' || msg === 'network')) {
        el.joinEnterError.textContent = "Couldn't find that room. Double-check the code and try again.";
        showLobbyStep(el.joinEnter);
      } else if (app.isHost) {
        el.roomCodeText.textContent = 'Could not create a room — check your connection.';
      }
    };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'lobby-info': {
        app.peerName = msg.hostName;
        buildColorGrid(el.joinColorGrid, [msg.hostColor]);
        showLobbyStep(el.joinSetup);
        break;
      }
      case 'guest-ready': {
        app.peerName = msg.name;
        const guestColor = msg.color;
        startHostedGame(app.myColor, guestColor, { [app.myColor]: app.myName, [guestColor]: msg.name });
        app.net.send({ type: 'game-start', hostColor: app.myColor, guestColor, hostName: app.myName, guestName: msg.name, state: app.state });
        break;
      }
      case 'game-start': {
        app.peerName = msg.hostName;
        app.state = msg.state;
        enterGameScreen();
        break;
      }
      case 'state-sync': {
        processIncomingState(msg.state, msg.event);
        break;
      }
      case 'intent-roll': {
        if (!app.isHost || app.animating || !app.state || app.state.phase !== 'roll') return;
        doRoll();
        break;
      }
      case 'intent-move': {
        if (!app.isHost || app.animating || !app.state || app.state.phase !== 'move') return;
        doMove(msg.tokenIndex);
        break;
      }
    }
  }

  // ---- Starting a game -------------------------------------------------------------
  function startHostedGame(colorA, colorB, names) {
    app.state = createInitialState(colorA, colorB, names);
    enterGameScreen();
  }

  function enterGameScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    el.screenGame.classList.add('active');
    buildBoardDOM(el.boardGrid);
    const activeColors = app.state.players.map(p => p.color);
    app.boardRenderer = new BoardRenderer(el.tokensLayer, el.fxLayer, activeColors);
    app.diceRenderer = new DiceRenderer(el.diceWrap, el.diceCube);
    app.boardRenderer.attachClickHandler(onTokenClicked);
    el.diceWrap.addEventListener('click', onDiceClicked);
    renderPlayerBadges();
    refreshBoardAndStatus();
  }

  function renderPlayerBadges() {
    const [p0, p1] = app.state.players;
    setBadge(el.badge0, p0);
    setBadge(el.badge1, p1);
  }
  function setBadge(badgeEl, player) {
    badgeEl.className = 'player-badge color-' + player.color;
    badgeEl.innerHTML = `<span class="dot"></span><span class="pname">${escapeHtml(player.name)}</span><span class="turn-flag">Turn</span>`;
  }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ---- Turn / status helpers ---------------------------------------------------------
  function myTurnNow() {
    return app.state && currentPlayer(app.state).color === app.myColor;
  }

  function refreshBoardAndStatus() {
    const state = app.state;
    [el.badge0, el.badge1].forEach((b, i) => {
      b.classList.toggle('active', state.currentPlayerIdx === i);
    });
    const legal = state.phase === 'move' ? getLegalMoves(state, state.diceValue).map(m => m.tokenIndex) : [];
    const activeColor = currentPlayer(state).color;
    app.boardRenderer.renderInstant(state, activeColor, legal);

    if (app.diceRenderer) {
      const lastVal = state.diceValue;
      if (lastVal) app.diceRenderer.setStatic(lastVal);
    }

    const mine = myTurnNow();
    el.diceCube.classList.toggle('disabled', !(mine && state.phase === 'roll'));

    let msg = '';
    if (state.phase === 'over') {
      msg = `${nameFor(state.winner)} wins! 👑`;
    } else if (mine) {
      msg = state.phase === 'roll' ? 'Your turn — tap the die' : 'Pick a glowing gem to move';
    } else {
      const oppName = currentPlayer(state).name;
      msg = `${oppName}'s turn…`;
    }
    el.statusMessage.textContent = msg;
    el.statusMessage.classList.toggle('you-turn', mine && state.phase !== 'over');
  }

  function nameFor(colorKey) {
    const p = app.state.players.find(p => p.color === colorKey);
    return p ? p.name : (COLORS[colorKey] ? COLORS[colorKey].name : colorKey);
  }

  // ---- Dice / move actions --------------------------------------------------------------
  function onDiceClicked() {
    if (app.animating) return;
    if (!myTurnNow() || app.state.phase !== 'roll') return;
    if (app.isHost) {
      doRoll();
    } else {
      el.diceCube.classList.add('disabled');
      app.net.send({ type: 'intent-roll' });
    }
  }

  function onTokenClicked(colorKey, tokenIndex) {
    if (app.animating) return;
    if (!myTurnNow() || app.state.phase !== 'move') return;
    if (colorKey !== app.myColor) return;
    if (app.isHost) {
      doMove(tokenIndex);
    } else {
      app.boardRenderer.clearMovable();
      app.net.send({ type: 'intent-move', tokenIndex });
    }
  }

  // ---- HOST-only: authoritative roll/move -------------------------------------------------
  async function doRoll() {
    const prevState = cloneState(app.state);
    const result = rollDice(app.state);
    const event = app.state.lastEvent;
    broadcastState(event);
    await playEventLocally(prevState, app.state, event);
    refreshBoardAndStatus();
  }

  async function doMove(tokenIndex) {
    const prevState = cloneState(app.state);
    const event = applyMove(app.state, tokenIndex);
    if (!event) return;
    broadcastState(event);
    await playEventLocally(prevState, app.state, event);
    refreshBoardAndStatus();
  }

  function broadcastState(event) {
    app.net.send({ type: 'state-sync', state: app.state, event });
  }

  function cloneState(s) { return JSON.parse(JSON.stringify(s)); }

  // ---- GUEST: process a state pushed by host ------------------------------------------------
  async function processIncomingState(newState, event) {
    const prevState = app.state;
    app.state = newState;
    await playEventLocally(prevState, newState, event);
    refreshBoardAndStatus();
  }

  // ---- Shared animation/FX driver (used by both host-local and guest-received events) -------
  async function playEventLocally(prevState, newState, event) {
    if (!event) return;
    app.animating = true;
    try {
      if (event.type === 'roll') {
        await app.diceRenderer.roll(event.value);
      } else if (event.type === 'bust') {
        const actor = colorOfEventActor(prevState);
        await app.diceRenderer.roll(6);
        el.statusMessage.textContent = `Three sixes! ${nameFor(actor)}'s turn is forfeited.`;
        await sleep(900);
      } else if (event.type === 'noMoves') {
        const actor = colorOfEventActor(prevState);
        await app.diceRenderer.roll(event.value);
        el.statusMessage.textContent = `No legal moves for ${nameFor(actor)} — turn passes.`;
        await sleep(750);
      } else if (['move', 'capture', 'finish', 'win'].includes(event.type)) {
        const colorKey = colorOfEventActor(prevState, event, newState);
        if (event.from === -1) {
          await app.boardRenderer.exitYard(colorKey, event.tokenIndex, newState);
        } else {
          await app.boardRenderer.animateStep(colorKey, event.tokenIndex, event.from, event.to, prevState);
        }
        if (event.capturedCount) {
          const g = progressToGrid(colorKey, event.to);
          Sound.capture();
          app.boardRenderer.burstAt(g.row, g.col, colorKey);
          await sleep(150);
        }
        if (event.type === 'finish' || event.type === 'win') {
          const g = progressToGrid(colorKey, event.to);
          Sound.finish();
          app.boardRenderer.burstAt(g.row, g.col, colorKey, 22);
        }
        if (newState.diceValue === 6 && event.type !== 'win') Sound.sixBonus();
      }

      if (event.type === 'win') {
        Sound.win();
        confettiBurst(newState.winner);
        showWinModal(newState.winner);
      }
    } finally {
      app.animating = false;
    }
  }

  function colorOfEventActor(stateBefore) {
    // the player whose token moved (or who rolled) is whoever's turn it was beforehand
    return currentPlayer(stateBefore).color;
  }

  // ---- Win / disconnect modals ------------------------------------------------------------------
  function showWinModal(winnerColor) {
    const iWon = winnerColor === app.myColor;
    el.winTitle.textContent = iWon ? 'Vijay! You win!' : `${nameFor(winnerColor)} wins!`;
    el.winSub.textContent = iWon ? 'Every gem made it home. Shahi Ludo mubarak ho!' : 'Better luck on the next roll of the dice.';
    el.modalWin.classList.add('show');
  }
  el.btnNewGame.addEventListener('click', () => {
    window.location.href = window.location.pathname;
  });

  function showGoneModal(text) {
    el.goneText.textContent = text;
    el.modalGone.classList.add('show');
  }
  el.btnGoneOk.addEventListener('click', () => {
    window.location.href = window.location.pathname;
  });

  el.btnLeave.addEventListener('click', () => {
    if (confirm('Leave this game?')) window.location.href = window.location.pathname;
  });

  el.btnMute.addEventListener('click', () => {
    Sound.muted = !Sound.muted;
    el.btnMute.textContent = Sound.muted ? '🔇' : '🔊';
  });
})();
