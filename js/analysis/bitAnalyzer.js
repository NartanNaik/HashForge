/**
 * ============================================================================
 *  File    : js/analysis/bitAnalyzer.js
 *  Project : Hash Forge
 *  Module  : Predictable-Data Analyzer (proves Slide 3: 2^-112 vs 2^-128)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  This file contains ONLY pure logic (no DOM, no HTML). It analyses the bits
 *  of any input data and shows that ordinary text is "predictably formatted":
 *  the highest-order bit (bit 7) of every ASCII byte is always 0.
 *
 *  Because XOR of zeros is zero, a simple XOR hash of ASCII text always has
 *  bit 7 = 0 in each of its bytes, so a 128-bit hash (16 bytes) really only
 *  uses 128 - 16 = 112 variable bits. That is the textbook claim
 *  (2^-112 for predictable text instead of 2^-128 for random data).
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. bitPositionFrequency(bytes)
 *       For each of the 8 bit positions (bit 0 .. bit 7), computes the
 *       fraction of bytes in which that bit is 1.
 *       Convention: result[7] is the highest-order (leftmost) bit.
 *
 *  2. fixedBitPositions(freq, threshold)
 *       Finds the bit positions that are (almost) always 0 or always 1,
 *       i.e. the "predictable" positions. Returns them with their fixed value.
 *
 *  3. effectiveHashBits(hashBits, fixedPerByte)
 *       Computes how many hash bits are really variable.
 *       Example: effectiveHashBits(128, 1) -> 112 effective bits,
 *       probability exponent -112 versus -128 for random data.
 *
 *  4. byteHeatmapData(bytes, maxRows)
 *       Builds a matrix (one row per byte, 8 columns, leftmost = bit 7)
 *       ready for the UI to render as a heatmap / bit grid.
 *
 *  5. analyzeBytes(bytes, hashBits)
 *       Convenience wrapper that runs everything above and returns one
 *       result object. The analyzerView.js file only needs to call this.
 *
 *  Helper (internal): byteToBits(byte) -> 8 bits, MSB first.
 *
 *  EDGE CASES HANDLED
 *  ------------------
 *  - Empty input: frequencies are NaN, so nothing is wrongly reported as
 *    "fixed", and analyzeBytes() returns an `empty: true` result.
 *  - hashBits must be a positive multiple of 8 (whole bytes), else an Error.
 *  - fixedPerByte must be an integer between 0 and 8, else an Error.
 *
 *  USED BY : js/ui/analyzerView.js, tests/bitAnalyzer.test.js
 *  DEPENDS : nothing (standalone module)
 * ============================================================================
 */

const BITS_PER_BYTE = 8;

/**
 * Convert one byte (0-255) into an array of 8 bits, most significant bit first.
 * Example: 72 (ASCII 'H') -> [0,1,0,0,1,0,0,0]
 * @param {number} byte
 * @returns {number[]}
 */
function byteToBits(byte) {
  const bits = new Array(BITS_PER_BYTE);
  for (let i = 0; i < BITS_PER_BYTE; i++) {
    // i = 0 is the leftmost bit (bit 7), i = 7 is the rightmost bit (bit 0)
    bits[i] = (byte >> (BITS_PER_BYTE - 1 - i)) & 1;
  }
  return bits;
}

/**
 * For each bit position, compute the fraction of bytes where that bit is 1.
 * Index = bit position, so result[7] is the highest-order bit and
 * result[0] is the lowest-order bit.
 *
 * For normal ASCII text: result[7] === 0.
 * For empty input: every entry is NaN (no data to analyse).
 *
 * @param {Uint8Array|number[]} bytes
 * @returns {number[]} array of 8 fractions between 0 and 1 (or NaN)
 */
export function bitPositionFrequency(bytes) {
  const n = bytes.length;
  if (n === 0) return new Array(BITS_PER_BYTE).fill(NaN);

  const ones = new Array(BITS_PER_BYTE).fill(0);
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    for (let pos = 0; pos < BITS_PER_BYTE; pos++) {
      ones[pos] += (b >> pos) & 1;
    }
  }
  return ones.map((count) => count / n);
}

/**
 * Find the bit positions that are (almost) always 0 or always 1.
 *
 * @param {number[]} freq       Output of bitPositionFrequency()
 * @param {number}   threshold  Tolerance (default 0). 0 means "exactly always".
 *                              Use e.g. 0.01 to allow 1% noise.
 * @returns {{position:number, value:0|1, frequency:number}[]}
 *          Sorted from the highest bit position to the lowest.
 */
export function fixedBitPositions(freq, threshold = 0) {
  const fixed = [];
  for (let pos = BITS_PER_BYTE - 1; pos >= 0; pos--) {
    const f = freq[pos];
    if (f <= threshold) {
      fixed.push({ position: pos, value: 0, frequency: f });
    } else if (f >= 1 - threshold) {
      fixed.push({ position: pos, value: 1, frequency: f });
    }
    // NaN fails both comparisons, so empty input reports nothing as fixed.
  }
  return fixed;
}

/**
 * Compute how many bits of an n-bit hash are really variable when
 * `fixedPerByte` bit positions in every byte are predictable.
 *
 * Example (the textbook case):
 *   effectiveHashBits(128, 1)
 *   -> 16 bytes, 16 fixed bits, 112 effective bits,
 *      random probability 2^-128, predictable probability 2^-112.
 *
 * @param {number} hashBits      Hash size in bits (multiple of 8), e.g. 128
 * @param {number} fixedPerByte  Fixed bit positions per byte (0-8), e.g. 1 for ASCII
 * @returns {{
 *   hashBits:number, hashBytes:number, fixedPerByte:number, fixedBits:number,
 *   effectiveBits:number, randomExponent:number, predictableExponent:number,
 *   randomProbability:string, predictableProbability:string
 * }}
 */
export function effectiveHashBits(hashBits, fixedPerByte) {
  if (!Number.isInteger(hashBits) || hashBits <= 0 || hashBits % BITS_PER_BYTE !== 0) {
    throw new Error('hashBits must be a positive multiple of 8');
  }
  if (!Number.isInteger(fixedPerByte) || fixedPerByte < 0 || fixedPerByte > BITS_PER_BYTE) {
    throw new Error('fixedPerByte must be an integer between 0 and 8');
  }

  const hashBytes = hashBits / BITS_PER_BYTE;
  const fixedBits = hashBytes * fixedPerByte;
  const effectiveBits = hashBits - fixedBits;

  return {
    hashBits,
    hashBytes,
    fixedPerByte,
    fixedBits,
    effectiveBits,
    randomExponent: -hashBits,
    predictableExponent: -effectiveBits,
    randomProbability: `2^-${hashBits}`,
    predictableProbability: `2^-${effectiveBits}`,
  };
}

/**
 * Build a matrix for the heatmap: one row per byte, 8 columns,
 * leftmost column = bit 7 (highest-order bit).
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} maxRows  Limit rows so huge files do not freeze the UI
 * @returns {{rows:number[][], bytes:number[], totalBytes:number, truncated:boolean}}
 */
export function byteHeatmapData(bytes, maxRows = 256) {
  const shown = Math.min(bytes.length, maxRows);
  const rows = [];
  const shownBytes = [];
  for (let i = 0; i < shown; i++) {
    rows.push(byteToBits(bytes[i]));
    shownBytes.push(bytes[i]);
  }
  return {
    rows,
    bytes: shownBytes,
    totalBytes: bytes.length,
    truncated: bytes.length > maxRows,
  };
}

/**
 * One-call analysis used by the UI.
 * Runs frequency analysis, finds fixed bits, and computes effective hash bits.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} hashBits   Hash size to evaluate (default 128)
 * @returns {object} { empty, totalBytes, frequency, fixed, effective, heatmap }
 */
export function analyzeBytes(bytes, hashBits = 128) {
  const frequency = bitPositionFrequency(bytes);
  const heatmap = byteHeatmapData(bytes);

  if (bytes.length === 0) {
    return {
      empty: true,
      totalBytes: 0,
      frequency,
      fixed: [],
      effective: effectiveHashBits(hashBits, 0),
      heatmap,
    };
  }

  const fixed = fixedBitPositions(frequency);
  const effective = effectiveHashBits(hashBits, fixed.length);

  return {
    empty: false,
    totalBytes: bytes.length,
    frequency,
    fixed,
    effective,
    heatmap,
  };
}