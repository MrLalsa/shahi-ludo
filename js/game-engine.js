/**
 * Shahi Ludo — game engine. Pure game-state logic, no rendering or
 * networking. The HOST runs this as the single source of truth and
 * broadcasts resulting state; the GUEST only ever sends "intents"
 * (roll / move) and renders whatever state the host sends back.
 */

const MAX_CONSECUTIVE_SIXES = 3;

function createInitialState(colorA, colorB, names) {
  return {
    players: [
      { color: colorA, name: names[colorA] || COLORS[colorA].name, tokens: [-1, -1, -1, -1] },
      { color: colorB, name: names[colorB] || COLORS[colorB].name, tokens: [-1, -1, -1, -1] },
    ],
    currentPlayerIdx: 0,
    diceValue: null,
    consecutiveSixes: 0,
    mustMove: false,       // true once a die has been rolled and a move is owed
    phase: 'roll',         // 'roll' | 'move' | 'over'
    winner: null,
    lastEvent: null,       // { type: 'capture'|'home'|'finish'|'bust'|'noMoves', ... } for UI/FX
    turnCount: 0,
  };
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIdx];
}
function otherPlayerIdx(state) {
  return state.currentPlayerIdx === 0 ? 1 : 0;
}

/** Absolute ring index for a token, or null if not on the shared ring. */
function ringIndexOf(colorKey, progress) {
  if (progress < 0 || progress > RING_STEPS - 1) return null;
  return (COLORS[colorKey].startIndex + progress) % RING_LEN;
}

/** All opponent token locations as { tokenIndex, progress, ringIndex }. */
function opponentTokensOnRing(state, ringIndex) {
  const oppIdx = otherPlayerIdx(state);
  const opp = state.players[oppIdx];
  const found = [];
  opp.tokens.forEach((prog, ti) => {
    const ri = ringIndexOf(opp.color, prog);
    if (ri === ringIndex) found.push(ti);
  });
  return found;
}

function ownTokensOnRing(state, playerIdx, ringIndex) {
  const p = state.players[playerIdx];
  const found = [];
  p.tokens.forEach((prog, ti) => {
    const ri = ringIndexOf(p.color, prog);
    if (ri === ringIndex) found.push(ti);
  });
  return found;
}

/**
 * Compute legal moves for the current player given a dice value.
 * Returns array of { tokenIndex, from, to, capturesTokenIndices, entersHome }.
 */
function getLegalMoves(state, diceValue) {
  const p = currentPlayer(state);
  const moves = [];

  p.tokens.forEach((progress, tokenIndex) => {
    if (progress === -1) {
      // Bringing a fresh token out needs a 6, landing on own start square.
      if (diceValue === 6) {
        const ringIndex = COLORS[p.color].startIndex;
        const blockers = opponentTokensOnRing(state, ringIndex);
        const blocked = blockers.length >= 2 && !isSafeRingIndex(ringIndex);
        // start squares are always safe anyway, but keep the check honest
        if (!blocked) {
          moves.push({ tokenIndex, from: -1, to: 0, capturesTokenIndices: [], entersHome: false });
        }
      }
      return;
    }
    if (progress === FINISH_PROGRESS) return; // already home, done

    const to = progress + diceValue;
    if (to > FINISH_PROGRESS) return; // overshoot, illegal

    if (to <= RING_STEPS - 1) {
      const ringIndex = ringIndexOf(p.color, to);
      const oppOnDest = opponentTokensOnRing(state, ringIndex);
      const safe = isSafeRingIndex(ringIndex);
      if (oppOnDest.length >= 2 && !safe) return; // blocked by an opponent wall
      const capturesTokenIndices = (!safe && oppOnDest.length === 1) ? oppOnDest : [];
      moves.push({ tokenIndex, from: progress, to, capturesTokenIndices, entersHome: false });
    } else {
      // moving within/into the private home column or exactly onto final home — never blocked/captured
      moves.push({ tokenIndex, from: progress, to, capturesTokenIndices: [], entersHome: to === FINISH_PROGRESS });
    }
  });

  return moves;
}

/** Roll the die, updating the consecutive-sixes counter. Returns {value, bust}. */
function rollDice(state) {
  const value = 1 + Math.floor(Math.random() * 6);
  if (value === 6) {
    state.consecutiveSixes += 1;
  } else {
    state.consecutiveSixes = 0;
  }
  const bust = state.consecutiveSixes >= MAX_CONSECUTIVE_SIXES;
  state.diceValue = value;
  if (bust) {
    state.lastEvent = { type: 'bust' };
    state.consecutiveSixes = 0;
    endTurn(state);
    return { value, bust: true };
  }
  const legal = getLegalMoves(state, value);
  if (legal.length === 0) {
    state.lastEvent = { type: 'noMoves', value };
    endTurn(state);
    return { value, bust: false, noMoves: true };
  }
  state.phase = 'move';
  state.mustMove = true;
  state.lastEvent = { type: 'roll', value };
  return { value, bust: false };
}

/** Apply a chosen move (tokenIndex must be one produced by getLegalMoves). */
function applyMove(state, tokenIndex) {
  const p = currentPlayer(state);
  const diceValue = state.diceValue;
  const legal = getLegalMoves(state, diceValue).find(m => m.tokenIndex === tokenIndex);
  if (!legal) return null;

  p.tokens[tokenIndex] = legal.to;

  let captured = false;
  if (legal.capturesTokenIndices.length) {
    const oppIdx = otherPlayerIdx(state);
    legal.capturesTokenIndices.forEach(ti => { state.players[oppIdx].tokens[ti] = -1; });
    captured = true;
  }

  const finished = legal.to === FINISH_PROGRESS;
  const rolledSix = diceValue === 6;
  const wonGame = finished && p.tokens.every(t => t === FINISH_PROGRESS);

  state.lastEvent = {
    type: wonGame ? 'win' : finished ? 'finish' : captured ? 'capture' : 'move',
    tokenIndex, from: legal.from, to: legal.to,
    capturedCount: legal.capturesTokenIndices.length,
  };

  if (wonGame) {
    state.winner = p.color;
    state.phase = 'over';
    state.mustMove = false;
    return state.lastEvent;
  }

  const extraTurn = captured || finished || rolledSix;
  state.mustMove = false;
  if (extraTurn) {
    state.phase = 'roll';
    state.diceValue = null;
  } else {
    endTurn(state);
  }
  return state.lastEvent;
}

function endTurn(state) {
  state.currentPlayerIdx = otherPlayerIdx(state);
  state.diceValue = null;
  state.phase = 'roll';
  state.mustMove = false;
  state.consecutiveSixes = 0;
  state.turnCount += 1;
}

const GAME_ENGINE_EXPORTS = {
  createInitialState, currentPlayer, otherPlayerIdx, ringIndexOf,
  getLegalMoves, rollDice, applyMove, endTurn, MAX_CONSECUTIVE_SIXES,
};
if (typeof window !== 'undefined') Object.assign(window, GAME_ENGINE_EXPORTS);
if (typeof module !== 'undefined') module.exports = GAME_ENGINE_EXPORTS;
