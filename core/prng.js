// Seeded pseudo-random numbers. Everything that must be reproducible
// (Daily Challenge, Duel questions, tests) goes through createRng(seed).
// Only integer maths is used for the state, so results are identical on
// every device and browser.

/** xmur3: turns a string into a 32-bit seed generator. */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: small, fast, good-enough 32-bit PRNG returning [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a random generator. `seed` may be a string or a number; when
 * omitted a random seed is used (non-reproducible).
 */
export function createRng(seed) {
  const resolved = seed === undefined || seed === null
    ? Math.floor(Math.random() * 4294967296)
    : seed;
  const numeric = typeof resolved === 'string' ? xmur3(resolved)() : resolved >>> 0;
  const next = mulberry32(numeric);

  return {
    seed: resolved,
    /** float in [0, 1) */
    next,
    /** integer in [min, max], both inclusive */
    int(min, max) {
      if (max < min) throw new RangeError(`rng.int: max (${max}) < min (${min})`);
      return min + Math.floor(next() * (max - min + 1));
    },
    /** true with probability p */
    chance(p) {
      return next() < p;
    },
    pick(list) {
      if (!list.length) throw new RangeError('rng.pick: empty list');
      return list[Math.floor(next() * list.length)];
    },
    /** Fisher-Yates; returns a new array. */
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
