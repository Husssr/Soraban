// Pure soroban bead model (no DOM) so it can be unit-tested in Node.
//
// A rod is { h, e }:
//   h = 1 when the heaven bead is pushed toward the beam (counts 5), else 0
//   e = how many of the 4 earth beads are pushed toward the beam (each counts 1)
// Because earth beads are stored as a *count*, an impossible position
// (e.g. a lower bead touching the beam while the one above it is away) can
// never be represented: positions are valid by construction.
//
// Rod arrays are most-significant first (index 0 = leftmost rod).

export const MAX_EARTH = 4;
export const MIN_RODS = 1;
export const MAX_RODS = 13;

export function isValidRod(rod) {
  return !!rod
    && (rod.h === 0 || rod.h === 1)
    && Number.isInteger(rod.e)
    && rod.e >= 0 && rod.e <= MAX_EARTH;
}

export function digitToRod(digit) {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    throw new RangeError(`digit must be an integer 0-9, got ${digit}`);
  }
  return { h: digit >= 5 ? 1 : 0, e: digit % 5 };
}

export function rodToDigit(rod) {
  if (!isValidRod(rod)) throw new RangeError(`invalid rod state ${JSON.stringify(rod)}`);
  return rod.h * 5 + rod.e;
}

/** Largest value representable on n rods (e.g. 3 rods -> 999). */
export function maxValue(rodCount) {
  return 10 ** rodCount - 1;
}

export function emptyRods(rodCount) {
  return Array.from({ length: rodCount }, () => ({ h: 0, e: 0 }));
}

/** value -> array of rod states (most significant first). */
export function valueToRods(value, rodCount) {
  if (!Number.isInteger(rodCount) || rodCount < 1) {
    throw new RangeError(`rodCount must be a positive integer, got ${rodCount}`);
  }
  if (!Number.isInteger(value) || value < 0 || value > maxValue(rodCount)) {
    throw new RangeError(`value ${value} cannot be shown on ${rodCount} rod(s)`);
  }
  const rods = [];
  for (let i = rodCount - 1; i >= 0; i--) {
    rods.push(digitToRod(Math.floor(value / 10 ** i) % 10));
  }
  return rods;
}

/** array of rod states -> number. */
export function rodsToValue(rods) {
  let value = 0;
  for (const rod of rods) value = value * 10 + rodToDigit(rod);
  return value;
}

export function rodsToDigits(rods) {
  return rods.map(rodToDigit);
}

export function rodsEqual(a, b) {
  return a.length === b.length && a.every((r, i) => r.h === b[i].h && r.e === b[i].e);
}

/** Heaven bead: push toward the beam (true) or away from it (false). */
export function moveHeaven(rod, toward) {
  return { h: toward ? 1 : 0, e: rod.e };
}

/**
 * Earth bead `index` (0 = the one nearest the beam). Pushing it toward the
 * beam also pushes every bead between it and the beam; pushing it away also
 * pushes every bead beyond it.
 */
export function moveEarth(rod, index, toward) {
  const e = toward ? Math.max(rod.e, index + 1) : Math.min(rod.e, index);
  return { h: rod.h, e };
}

export function tapHeaven(rod) {
  return moveHeaven(rod, rod.h === 0);
}

/** Tapping a bead flips it: active beads move away, inactive move toward. */
export function tapEarth(rod, index) {
  return moveEarth(rod, index, index >= rod.e);
}

/** digit +delta, clamped to 0-9 (keyboard up/down). */
export function stepDigit(rod, delta) {
  const next = Math.min(9, Math.max(0, rodToDigit(rod) + delta));
  return digitToRod(next);
}
