/**
 * Shahi Ludo — rendering layer. Builds the static board once, then
 * animates tokens/dice/FX on top of it. Pure DOM + Web Audio; no
 * framework, so GitHub Pages can serve this as flat static files.
 */

// ---------------------------------------------------------------------------
// Cell classification (for the one-time static board build)
// ---------------------------------------------------------------------------
const RING_SET = (() => {
  const m = new Map();
  RING_PATH.forEach(([r, c], idx) => m.set(r * 100 + c, idx));
  return m;
})();

function cellRole(row, col) {
  for (const key of COLOR_KEYS) {
    const y = COLORS[key].yard;
    if (row >= y.r0 && row <= y.r1 && col >= y.c0 && col <= y.c1) return { cls: `yard-${key}` };
  }
  const ringIdx = RING_SET.get(row * 100 + col);
  if (ringIdx !== undefined) {
    return { cls: isSafeRingIndex(ringIdx) ? 'ring-safe' : 'ring', ringIndex: ringIdx };
  }
  for (const key of COLOR_KEYS) {
    if (COLORS[key].homeColumn.some(([r, c]) => r === row && c === col)) return { cls: `home-${key}` };
    const [fr, fc] = COLORS[key].finalHome;
    if (fr === row && fc === col) return { cls: `final-${key}` };
  }
  return { cls: 'center' };
}

// ---------------------------------------------------------------------------
// Static board construction
// ---------------------------------------------------------------------------
function buildBoardDOM(gridEl) {
  gridEl.innerHTML = '';
  const startIndexSet = new Set(COLOR_KEYS.map(k => COLORS[k].startIndex));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const { cls, ringIndex } = cellRole(r, c);
      const div = document.createElement('div');
      div.className = 'cell ' + cls;
      if (ringIndex !== undefined && startIndexSet.has(ringIndex)) div.classList.add('start-marker');
      gridEl.appendChild(div);
    }
  }
  // yard decorative plates + slot rings
  COLOR_KEYS.forEach(key => {
    const y = COLORS[key].yard;
    const plate = document.createElement('div');
    plate.className = 'yard-plate';
    plate.style.left = (y.c0 / BOARD_SIZE * 100) + '%';
    plate.style.top = (y.r0 / BOARD_SIZE * 100) + '%';
    plate.style.width = ((y.c1 - y.c0 + 1) / BOARD_SIZE * 100) + '%';
    plate.style.height = ((y.r1 - y.r0 + 1) / BOARD_SIZE * 100) + '%';
    gridEl.parentElement.appendChild(plate);
    COLORS[key].yardSlots.forEach(([sr, sc]) => {
      const ring = document.createElement('div');
      ring.className = 'yard-slot-ring';
      const size = 1.15 / BOARD_SIZE * 100;
      ring.style.width = size + '%';
      ring.style.height = size + '%';
      ring.style.left = (sc / BOARD_SIZE * 100) + '%';
      ring.style.top = (sr / BOARD_SIZE * 100) + '%';
      ring.style.transform = 'translate(-50%,-50%)';
      gridEl.parentElement.appendChild(ring);
    });
  });
}

// ---------------------------------------------------------------------------
// Token position math (with same-cell stacking offsets)
// ---------------------------------------------------------------------------
const STACK_OFFSETS = {
  1: [[0, 0]],
  2: [[-0.21, 0], [0.21, 0]],
  3: [[0, -0.22], [-0.22, 0.16], [0.22, 0.16]],
  4: [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]],
};

/** Compute {xPct, yPct} (0-100) for a token, given all tokens sharing its cell for offset purposes. */
function tokenCellCenterPct(colorKey, progress, slotIndexInStack, stackSize) {
  let xFrac, yFrac;
  if (progress === -1) {
    const [r, c] = COLORS[colorKey].yardSlots[slotIndexInStack % 4];
    xFrac = c / BOARD_SIZE; yFrac = r / BOARD_SIZE;
    return { xPct: xFrac * 100, yPct: yFrac * 100 };
  }
  const g = progressToGrid(colorKey, progress);
  const f = gridToFrac(g.row, g.col);
  const n = Math.min(stackSize, 4) || 1;
  const [ox, oy] = STACK_OFFSETS[n][slotIndexInStack % n];
  const cellFrac = 1 / BOARD_SIZE;
  return { xPct: (f.x + ox * cellFrac) * 100, yPct: (f.y + oy * cellFrac) * 100 };
}

// ---------------------------------------------------------------------------
// Board renderer: keeps token DOM elements in sync with game state
// ---------------------------------------------------------------------------
class BoardRenderer {
  constructor(tokensLayerEl, fxLayerEl, activeColorKeys) {
    this.layer = tokensLayerEl;
    this.fx = fxLayerEl;
    this.activeColorKeys = activeColorKeys;
    this.els = {}; // key `${color}-${idx}` -> element
    activeColorKeys.forEach(key => {
      for (let i = 0; i < 4; i++) {
        const el = document.createElement('div');
        el.className = `token color-${key}`;
        el.dataset.color = key;
        el.dataset.index = i;
        this.layer.appendChild(el);
        this.els[`${key}-${i}`] = el;
      }
    });
  }

  /** Group tokens by the cell they currently occupy (progress + color-specific grid resolve). */
  _groupsForState(state) {
    const groups = new Map(); // "row,col" or "yard-color" -> [{color,idx}]
    state.players.forEach(p => {
      p.tokens.forEach((prog, idx) => {
        let key;
        if (prog === -1) key = `yard-${p.color}`;
        else {
          const g = progressToGrid(p.color, prog);
          key = `${g.row},${g.col}`;
        }
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ color: p.color, idx, prog });
      });
    });
    return groups;
  }

  /** Snap all tokens to match state instantly (no CSS transition) — init / resync. */
  renderInstant(state, activeColorKey, legalTokenIndices, noTransition = true) {
    const groups = this._groupsForState(state);
    const cellOf = {};
    groups.forEach(list => list.forEach((t, i) => { cellOf[`${t.color}-${t.idx}`] = { i, n: list.length, prog: t.prog }; }));

    Object.entries(this.els).forEach(([key, tokenEl]) => {
      const [color, idxStr] = key.split('-');
      const idx = Number(idxStr);
      const info = cellOf[key];
      const { xPct, yPct } = tokenCellCenterPct(color, info.prog, info.i, info.n);
      if (noTransition) tokenEl.style.transition = 'none';
      tokenEl.style.left = xPct + '%';
      tokenEl.style.top = yPct + '%';
      if (noTransition) { void tokenEl.offsetWidth; tokenEl.style.transition = ''; }
      const movable = color === activeColorKey && legalTokenIndices && legalTokenIndices.includes(idx);
      tokenEl.classList.toggle('movable', !!movable);
      tokenEl.classList.toggle('stack-2', info.n >= 2);
    });
  }

  /** Animate a token popping out of its yard onto its start square (smooth CSS transition, no intermediate hops needed — it's a single move). */
  async exitYard(colorKey, tokenIndex, stateAfterExit) {
    const el = this.els[`${colorKey}-${tokenIndex}`];
    el.classList.add('moving');
    Sound.step();
    const { xPct, yPct } = tokenCellCenterPct(colorKey, 0, 0, 1);
    el.style.left = xPct + '%';
    el.style.top = yPct + '%';
    await sleep(320);
    el.classList.remove('moving');
  }

  setMovable(colorKey, legalTokenIndices) {
    Object.entries(this.els).forEach(([key, el]) => {
      const [color, idxStr] = key.split('-');
      const idx = Number(idxStr);
      el.classList.toggle('movable', color === colorKey && legalTokenIndices.includes(idx));
    });
  }

  clearMovable() {
    Object.values(this.els).forEach(el => el.classList.remove('movable'));
  }

  attachClickHandler(handler) {
    this.layer.addEventListener('click', (e) => {
      const el = e.target.closest('.token.movable');
      if (!el) return;
      handler(el.dataset.color, Number(el.dataset.index));
    });
  }

  /** Animate a single token hopping step-by-step from fromProgress to toProgress. */
  async animateStep(colorKey, tokenIndex, fromProgress, toProgress, state, msPerStep = 165) {
    const el = this.els[`${colorKey}-${tokenIndex}`];
    el.classList.add('moving');
    const dir = toProgress > fromProgress ? 1 : 0; // always forward in this game
    let p = fromProgress;
    while (p < toProgress) {
      p += 1;
      const groups = this._groupsForState(state); // state not yet mutated by caller for final cell; ok for interim
      const { xPct, yPct } = this._interimPosition(colorKey, tokenIndex, p, state);
      el.style.left = xPct + '%';
      el.style.top = yPct + '%';
      Sound.step();
      await sleep(msPerStep);
    }
    el.classList.remove('moving');
  }

  _interimPosition(colorKey, tokenIndex, prog, state) {
    // during interim hops we don't bother computing exact stack siblings — just centre on the cell
    return tokenCellCenterPct(colorKey, prog, 0, 1);
  }

  burstAt(row, col, colorKey, count = 14) {
    const f = gridToFrac(row, col);
    const colorVar = { red: '--ruby-bright', green: '--emerald-bright', yellow: '--marigold-bright', blue: '--sapphire-bright' }[colorKey] || '--gold-bright';
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      s.className = 'spark';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 26 + Math.random() * 30;
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      s.style.left = (f.x * 100) + '%';
      s.style.top = (f.y * 100) + '%';
      s.style.background = `var(${colorVar})`;
      this.fx.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  }
}

// Animation timings scale via window.__ANIM_SPEED__ (default 1). Only ever
// overridden by the automated smoke test, to run full games in seconds
// instead of minutes — normal play always uses the real timings.
function sleep(ms) { return new Promise(res => setTimeout(res, ms * (window.__ANIM_SPEED__ || 1))); }

// ---------------------------------------------------------------------------
// 3D dice
// ---------------------------------------------------------------------------
const FACE_FOR_ROTATION = {
  // maps a settled (x%360,y%360) rotation pair to a top-facing number is complex;
  // instead we just pick a random plausible tumble and force the FRONT face to
  // show the final number, since only the front face is guaranteed on-camera.
};

class DiceRenderer {
  constructor(wrapEl, cubeEl) {
    this.wrap = wrapEl;
    this.cube = cubeEl;
    this.faces = {};
    ['front', 'back', 'right', 'left', 'top', 'bottom'].forEach(name => {
      this.faces[name] = cubeEl.querySelector(`.face-${name}`);
    });
  }

  setStatic(n) {
    this.faces.front.dataset.n = n;
  }

  async roll(finalValue) {
    Sound.roll();
    // randomize all non-front faces so the tumble looks lively
    const order = [1, 2, 3, 4, 5, 6].filter(n => n !== finalValue);
    shuffleInPlace(order);
    this.faces.front.dataset.n = finalValue;
    this.faces.back.dataset.n = order[0];
    this.faces.right.dataset.n = order[1];
    this.faces.left.dataset.n = order[2];
    this.faces.top.dataset.n = order[3];
    this.faces.bottom.dataset.n = order[4];

    const spins = 1 + Math.floor(Math.random() * 2);
    this.cube.style.setProperty('--final-x', (spins * 360 - 24) + 'deg');
    this.cube.style.setProperty('--final-y', (spins * 360 + 35) + 'deg');
    this.cube.classList.remove('rolling');
    // force reflow so the animation restarts cleanly
    void this.cube.offsetWidth;
    this.cube.classList.add('rolling');
    await sleep(900);
    this.cube.classList.remove('rolling');
    this.cube.style.transform = `rotateX(-24deg) rotateY(35deg)`;
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Confetti (win screen)
// ---------------------------------------------------------------------------
function confettiBurst(colorKey) {
  const colors = {
    red: ['#e85a76', '#c13a54'], green: ['#33c79a', '#1e8a6e'],
    yellow: ['#ffb84d', '#e8951f'], blue: ['#5b8fe0', '#3164b0'],
  }[colorKey] || ['#f2d98a', '#c6a15b'];
  const goldMix = ['#f2d98a', '#c6a15b'];
  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const palette = Math.random() < 0.6 ? colors : goldMix;
    piece.style.background = palette[Math.floor(Math.random() * palette.length)];
    piece.style.left = Math.random() * 100 + 'vw';
    const dur = 2.2 + Math.random() * 1.6;
    piece.style.animationDuration = dur + 's';
    piece.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    piece.style.animationDelay = (Math.random() * 0.6) + 's';
    piece.style.opacity = 0.85 + Math.random() * 0.15;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), (dur + 1) * 1000);
  }
}

// ---------------------------------------------------------------------------
// Synthesized audio (Web Audio API — no external sound files needed)
// ---------------------------------------------------------------------------
const Sound = {
  ctx: null,
  muted: false,
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  _tone(freq, dur, type = 'sine', gainPeak = 0.18, delay = 0) {
    if (this.muted) return;
    const ctx = this._ensure();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },
  _click(delay = 0, gainPeak = 0.14) {
    if (this.muted) return;
    const ctx = this._ensure();
    const t0 = ctx.currentTime + delay;
    const bufferSize = ctx.sampleRate * 0.03;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 1200;
    src.connect(filt).connect(gain).connect(ctx.destination);
    src.start(t0);
  },
  roll() { for (let i = 0; i < 6; i++) this._click(i * 0.07, 0.1); },
  step() { this._click(0, 0.09); },
  capture() {
    this._tone(420, 0.12, 'sawtooth', 0.13, 0);
    this._tone(220, 0.28, 'sawtooth', 0.15, 0.08);
  },
  finish() {
    this._tone(523.25, 0.18, 'triangle', 0.15, 0);
    this._tone(659.25, 0.22, 'triangle', 0.15, 0.11);
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, 0.5, 'triangle', 0.14, i * 0.12));
  },
  sixBonus() { this._tone(880, 0.14, 'sine', 0.12, 0); },
};

const RENDERER_EXPORTS = { cellRole, buildBoardDOM, BoardRenderer, DiceRenderer, confettiBurst, Sound, tokenCellCenterPct, sleep };
if (typeof window !== 'undefined') Object.assign(window, RENDERER_EXPORTS);
if (typeof module !== 'undefined') module.exports = RENDERER_EXPORTS;
