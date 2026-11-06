/**
 * Seeded randomness. Every random draw in CFO Arena goes through this file, so a
 * scenario code reproduces a game exactly.
 *
 * Separate named streams (events, project quality, offers) are derived from the
 * scenario seed, so a player's decisions never change the events they face.
 * That is what makes classroom mode fair: everyone with the same code sees the
 * same monsoon, the same price war and the same project menu.
 */

/** 32-bit string hash (cyrb53 folded to 32 bits). */
export function hash32(str) {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent stream for (scenario code, purpose, ...keys). */
export function streamFor(code, ...keys) {
  const next = mulberry32(hash32([code, ...keys].join('|')));
  return {
    next,
    /** Uniform in [lo, hi). */
    uniform(lo, hi) {
      return lo + (hi - lo) * next();
    },
    /** Standard normal via Box-Muller. */
    normal(mean = 0, sd = 1) {
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    /** Fisher-Yates shuffle of a copy. */
    shuffle(items) {
      const arr = [...items];
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}
