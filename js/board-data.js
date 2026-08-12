/**
 * Shahi Ludo — board geometry.
 *
 * Grid is a 15x15 conceptual space (rows/cols 0..14), the classic Ludo cross:
 *  - 4 corner yards (6x6 each)
 *  - a shared 56-cell ring path around the cross
 *  - 4 colored home-column stretches (5 cells each) leading to the centre
 *
 * RING_PATH was derived and verified programmatically (adjacency + single
 * closed loop confirmed) rather than hand-transcribed, so token movement is
 * guaranteed to always land on an orthogonally-adjacent cell, cell after
 * cell, all the way around.
 */

const BOARD_SIZE = 15;

const RING_PATH = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 6], [4, 6], [3, 6],
  [2, 6], [1, 6], [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8],
  [5, 8], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6], [8, 5], [8, 4],
  [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0]
];
const RING_LEN = RING_PATH.length; // 56

// A token's journey: 55 steps on the shared ring (progress 0..54, relative
// to its own colour's start), then 5 steps through its home column
// (progress 55..59), then progress 60 = home (finished). Exact count needed.
const RING_STEPS = RING_LEN - 1; // 55
const HOME_COL_LEN = 5;
const FINISH_PROGRESS = RING_STEPS + HOME_COL_LEN; // 60

const COLORS = {
  red: {
    key: 'red', name: 'Red', order: 0,
    startIndex: 0,
    homeColumn: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    finalHome: [7, 6],
    yard: { r0: 0, r1: 5, c0: 0, c1: 5 },
    yardSlots: [[1.5, 1.5], [1.5, 4.5], [4.5, 1.5], [4.5, 4.5]],
  },
  green: {
    key: 'green', name: 'Green', order: 1,
    startIndex: 14,
    homeColumn: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    finalHome: [6, 7],
    yard: { r0: 0, r1: 5, c0: 9, c1: 14 },
    yardSlots: [[1.5, 10.5], [1.5, 13.5], [4.5, 10.5], [4.5, 13.5]],
  },
  yellow: {
    key: 'yellow', name: 'Yellow', order: 2,
    startIndex: 28,
    homeColumn: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    finalHome: [7, 8],
    yard: { r0: 9, r1: 14, c0: 9, c1: 14 },
    yardSlots: [[10.5, 10.5], [10.5, 13.5], [13.5, 10.5], [13.5, 13.5]],
  },
  blue: {
    key: 'blue', name: 'Blue', order: 3,
    startIndex: 42,
    homeColumn: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    finalHome: [8, 7],
    yard: { r0: 9, r1: 14, c0: 0, c1: 5 },
    yardSlots: [[10.5, 1.5], [10.5, 4.5], [13.5, 1.5], [13.5, 4.5]],
  },
};
const COLOR_KEYS = ['red', 'green', 'yellow', 'blue'];

// Safe squares: every colour's start square, plus one "star" square roughly
// a third of the way around each colour's stretch. Tokens on these cannot
// be captured, and multiple colours may share them peacefully.
const SAFE_INDICES = new Set([
  0, 14, 28, 42, // starts
  9, 23, 37, 51, // stars
]);

/** Grid (row,col) -> center position as a 0..1 fraction of the board. */
function gridToFrac(row, col) {
  return { x: (col + 0.5) / BOARD_SIZE, y: (row + 0.5) / BOARD_SIZE };
}
function yardSlotToFrac(pair) {
  const [row, col] = pair;
  return { x: col / BOARD_SIZE, y: row / BOARD_SIZE };
}

/**
 * Resolve a token's board position.
 * progress: -1 = in yard, 0..54 = on shared ring, 55..59 = in home column,
 * 60 = finished (sitting on finalHome).
 * Returns { row, col } grid coords, or null if in yard (caller uses yard slot).
 */
function progressToGrid(colorKey, progress) {
  const cfg = COLORS[colorKey];
  if (progress < 0) return null;
  if (progress <= RING_STEPS - 1) {
    const idx = (cfg.startIndex + progress) % RING_LEN;
    return { row: RING_PATH[idx][0], col: RING_PATH[idx][1], kind: 'ring', ringIndex: idx };
  }
  const homeIdx = progress - RING_STEPS;
  if (homeIdx < HOME_COL_LEN) {
    const [row, col] = cfg.homeColumn[homeIdx];
    return { row, col, kind: 'home-column' };
  }
  const [row, col] = cfg.finalHome;
  return { row, col, kind: 'finished' };
}

function isSafeRingIndex(idx) {
  return SAFE_INDICES.has(idx);
}

const BOARD_DATA_EXPORTS = {
  BOARD_SIZE, RING_PATH, RING_LEN, RING_STEPS, HOME_COL_LEN, FINISH_PROGRESS,
  COLORS, COLOR_KEYS, SAFE_INDICES, gridToFrac, yardSlotToFrac,
  progressToGrid, isSafeRingIndex,
};
// Explicit window assignment: classic <script> tags share `const`/`let` in the
// document's top-level lexical scope, but assigning to `window` too makes
// these robust to any loading method (bundlers, eval-based tooling, etc).
if (typeof window !== 'undefined') Object.assign(window, BOARD_DATA_EXPORTS);
if (typeof module !== 'undefined') module.exports = BOARD_DATA_EXPORTS;
