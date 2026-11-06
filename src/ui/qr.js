/**
 * Minimal QR Code generator (ISO/IEC 18004): byte mode, error correction level M,
 * versions 1-10 (up to 213 bytes). Written for CFO Arena so the site has no
 * third-party runtime dependencies. Algorithm follows the standard closely:
 * Reed-Solomon over GF(256) with polynomial 0x11D, block interleaving, function
 * patterns, the 8 masks and the four penalty rules.
 */

// Error-correction codewords per block and number of blocks for level M, versions 1..10.
const ECC_PER_BLOCK_M = [null, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS_M = [null, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMAT_BITS_M = 0; // level M is encoded as binary 00

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver) {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];
}

/* ---------- Reed-Solomon ---------- */

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

/* ---------- Encoding ---------- */

function encodeData(bytes, ver) {
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const capacityBits = numDataCodewords(ver) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  return codewords;
}

function addEccAndInterleave(data, ver) {
  const numBlocks = NUM_BLOCKS_M[ver];
  const eccLen = ECC_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const datLen = shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0); // placeholder, skipped below
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - eccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

/* ---------- Matrix ---------- */

function makeMatrix(ver) {
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns with separators
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // Alignment patterns
  const alignPos = [];
  if (ver > 1) {
    const numAlign = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    alignPos.push(6);
    for (let pos = size - 7; alignPos.length < numAlign; pos -= step) alignPos.splice(1, 0, pos);
  }
  const n = alignPos.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          set(alignPos[i] + dx, alignPos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  // Reserve format areas (real bits drawn later) and version info
  drawFormat(0, modules, isFunction, size, true);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
  return { size, modules, isFunction };
}

function drawFormat(mask, modules, isFunction, size, reserveOnly = false) {
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => (reserveOnly ? false : ((bits >>> i) & 1) === 1);
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // dark module
}

function drawCodewords(codewords, modules, isFunction, size) {
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < total) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i += 1;
        }
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(mask, modules, isFunction, size) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isFunction[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
    }
  }
}

function penalty(modules, size) {
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y += 1) lines.push(modules[y]);
  for (let x = 0; x < size; x += 1) lines.push(modules.map((row) => row[x]));
  // Rule 1: runs of 5+ same colour; Rule 3: finder-like patterns
  const pattern = [true, false, true, true, true, false, true];
  for (const line of lines) {
    let runColor = line[0];
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === runColor) {
        run += 1;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        if (i < size) {
          runColor = line[i];
          run = 1;
        }
      }
    }
    for (let i = 0; i + 7 <= size; i += 1) {
      if (pattern.every((v, k) => line[i + k] === v)) {
        const before = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
        const after = i + 11 <= size && [7, 8, 9, 10].every((k) => !line[i + k]);
        if (before || after) score += 40;
      }
    }
  }
  // Rule 2: 2x2 blocks
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }
  // Rule 4: dark proportion
  let dark = 0;
  modules.forEach((row) => row.forEach((c) => {
    if (c) dark += 1;
  }));
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * 10;
  return score;
}

/** Encode text into a QR matrix (array of rows of booleans). */
export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= 10; ver += 1) {
    const capacity = numDataCodewords(ver) * 8;
    const needed = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
    if (needed <= capacity) break;
  }
  if (ver > 10) throw new Error('Text too long for this QR encoder.');
  const codewords = addEccAndInterleave(encodeData(bytes, ver), ver);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const { size, modules, isFunction } = makeMatrix(ver);
    drawCodewords(codewords, modules, isFunction, size);
    applyMask(mask, modules, isFunction, size);
    drawFormat(mask, modules, isFunction, size);
    const p = penalty(modules, size);
    if (!best || p < best.p) best = { p, modules, size, mask, ver };
  }
  return best;
}

/** Render a QR code as an SVG element (dark modules as one path, quiet zone of 4). */
export function qrSvg(text, { label = 'QR code' } = {}) {
  const { modules, size } = qrMatrix(text);
  const quiet = 4;
  const dim = size + quiet * 2;
  let d = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${dim} ${dim}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(dim));
  bg.setAttribute('height', String(dim));
  bg.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000000');
  svg.append(bg, path);
  return svg;
}
