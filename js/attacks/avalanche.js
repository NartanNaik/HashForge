/**
 * ============================================================================
 *  File    : js/attacks/avalanche.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Avalanche Effect Test (supports Slides 7 and 9)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure logic (no DOM). It measures the AVALANCHE EFFECT: if we flip a single
 *  bit of the input message, how many bits of the hash output change?
 *
 *    - A good cryptographic hash (SHA-256) changes about 50% of its output
 *      bits, whichever input bit we flip.
 *    - XOR hash changes exactly 1 output bit (XOR is linear).
 *    - RXOR hash also changes exactly 1 output bit. The one-bit rotation only
 *      MOVES the changed bit to another position, it never spreads it.
 *
 *  This is the quantitative proof that XOR and RXOR are weak: tiny, local
 *  input changes cause tiny, predictable output changes, which is exactly
 *  what makes the forgery attack possible.
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. avalancheTest(msgBytes, bitIndex, blockBytes)   [async]
 *       Flips ONE input bit, recomputes XOR, RXOR and SHA-256, and returns
 *       for each algorithm: hash before, hash after, the XOR-difference mask
 *       (for highlighting changed bits in the UI), number of changed bits,
 *       total hash bits, and the percentage changed.
 *
 *  2. avalancheBatch(msgBytes, trials, blockBytes, rng)   [async]
 *       Repeats avalancheTest() on many random bit positions and returns the
 *       AVERAGE changed bits / percentage for each algorithm, plus every
 *       individual trial.
 *
 *  3. toChartData(batchResult)
 *       Converts the batch result into { labels, values } so charts.js
 *       (renderAvalancheChart) can draw the XOR vs RXOR vs SHA-256 bar chart.
 *
 *  Internal helpers: assertValidMessage(), compareBits(), randomBitIndex().
 *
 *  DESIGN NOTES
 *  ------------
 *  - The original message array is never modified (a copy is flipped).
 *  - XOR/RXOR hash size = blockBytes * 8 bits (default 2 bytes = 16 bits, the
 *    demo size). SHA-256 is always 256 bits. Percentages are measured against
 *    each algorithm's OWN hash size.
 *  - Random bit positions use Math.random (not security sensitive). An `rng`
 *    function can be passed in so tests are repeatable.
 *  - Bit index convention is whatever flipBit() in bitUtils.js uses
 *    (planned: 0 = leftmost bit of the first byte).
 *
 *  EXPECTED SIGNATURES FROM OTHER FILES (to be written next)
 *  ---------------------------------------------------------
 *    bitUtils.js : flipBit(bytes, index) -> Uint8Array (new array)
 *                  hammingDistance(a, b) -> number of differing bits
 *                  xorBytes(a, b)        -> Uint8Array (a XOR b)
 *    xorHash.js  : xorHash(bytes, blockBytes)  -> Uint8Array
 *    rxorHash.js : rxorHash(bytes, blockBytes) -> Uint8Array
 *    sha256.js   : sha256(bytes)               -> Promise<Uint8Array>
 *
 *  USED BY : js/ui/collisionView.js, js/charts/charts.js
 *  DEPENDS : core/bitUtils.js, core/xorHash.js, core/rxorHash.js, core/sha256.js
 * ============================================================================
 */

import { flipBit, hammingDistance, xorBytes } from '../core/bitUtils.js';
import { xorHash } from '../core/xorHash.js';
import { rxorHash } from '../core/rxorHash.js';
import { sha256 } from '../core/sha256.js';

/** Default demo block size: 2 bytes = 16-bit XOR/RXOR hash. */
const DEFAULT_BLOCK_BYTES = 2;

/** Display names used for results and chart labels (fixed order). */
const ALGORITHMS = ['XOR', 'RXOR', 'SHA-256'];

/**
 * Make sure the message is a non-empty byte array.
 * @param {Uint8Array|number[]} msgBytes
 */
function assertValidMessage(msgBytes) {
  if (!msgBytes || msgBytes.length === 0) {
    throw new Error('Message must contain at least one byte');
  }
}

/**
 * Compare two hashes of the same algorithm and describe the difference.
 * @param {string} name        Algorithm name
 * @param {Uint8Array} before  Hash of the original message
 * @param {Uint8Array} after   Hash of the message with one bit flipped
 */
function compareBits(name, before, after) {
  const hashBits = before.length * 8;
  const changedBits = hammingDistance(before, after);
  return {
    name,
    hashBits,
    before,
    after,
    diff: xorBytes(before, after), // 1-bits mark the positions that changed
    changedBits,
    percent: (changedBits / hashBits) * 100,
  };
}

/**
 * Pick a random bit index in [0, totalBits).
 * @param {number} totalBits
 * @param {() => number} rng  Returns a number in [0, 1)
 */
function randomBitIndex(totalBits, rng) {
  return Math.floor(rng() * totalBits);
}

/**
 * Flip ONE input bit and measure how much each hash output changes.
 *
 * @param {Uint8Array|number[]} msgBytes  Original message
 * @param {number} bitIndex               Which input bit to flip
 * @param {number} blockBytes             XOR/RXOR block size in bytes (default 2)
 * @returns {Promise<{
 *   bitIndex:number,
 *   original:Uint8Array,
 *   modified:Uint8Array,
 *   results:{ XOR:object, RXOR:object, 'SHA-256':object }
 * }>}
 */
export async function avalancheTest(msgBytes, bitIndex, blockBytes = DEFAULT_BLOCK_BYTES) {
  assertValidMessage(msgBytes);

  const totalBits = msgBytes.length * 8;
  if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex >= totalBits) {
    throw new Error(`bitIndex must be an integer between 0 and ${totalBits - 1}`);
  }

  // Work on copies so the caller's message is never modified.
  const original = Uint8Array.from(msgBytes);
  const copy = Uint8Array.from(msgBytes);
  const modified = flipBit(copy, bitIndex) ?? copy; // works if flipBit returns or mutates

  const xorBefore = xorHash(original, blockBytes);
  const xorAfter = xorHash(modified, blockBytes);

  const rxorBefore = rxorHash(original, blockBytes);
  const rxorAfter = rxorHash(modified, blockBytes);

  const [shaBefore, shaAfter] = await Promise.all([sha256(original), sha256(modified)]);

  return {
    bitIndex,
    original,
    modified,
    results: {
      XOR: compareBits('XOR', xorBefore, xorAfter),
      RXOR: compareBits('RXOR', rxorBefore, rxorAfter),
      'SHA-256': compareBits('SHA-256', shaBefore, shaAfter),
    },
  };
}

/**
 * Run the avalanche test on many random bit positions and average the results.
 *
 * @param {Uint8Array|number[]} msgBytes  Original message
 * @param {number} trials                 Number of random bit flips (default 100)
 * @param {number} blockBytes             XOR/RXOR block size in bytes (default 2)
 * @param {() => number} rng              Random source in [0,1) (default Math.random)
 * @returns {Promise<{
 *   trials:number,
 *   averages:{ [name:string]: { hashBits:number, avgChangedBits:number, avgPercent:number } },
 *   runs:object[]
 * }>}
 */
export async function avalancheBatch(
  msgBytes,
  trials = 100,
  blockBytes = DEFAULT_BLOCK_BYTES,
  rng = Math.random
) {
  assertValidMessage(msgBytes);
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error('trials must be a positive integer');
  }

  const totalBits = msgBytes.length * 8;
  const sums = {};
  const hashBitsOf = {};
  for (const name of ALGORITHMS) sums[name] = 0;

  const runs = [];
  for (let t = 0; t < trials; t++) {
    const bitIndex = randomBitIndex(totalBits, rng);
    const run = await avalancheTest(msgBytes, bitIndex, blockBytes);
    runs.push(run);
    for (const name of ALGORITHMS) {
      sums[name] += run.results[name].changedBits;
      hashBitsOf[name] = run.results[name].hashBits;
    }
  }

  const averages = {};
  for (const name of ALGORITHMS) {
    const avgChangedBits = sums[name] / trials;
    averages[name] = {
      hashBits: hashBitsOf[name],
      avgChangedBits,
      avgPercent: (avgChangedBits / hashBitsOf[name]) * 100,
    };
  }

  return { trials, averages, runs };
}

/**
 * Convert a batch result into chart-friendly data.
 * Bar heights are the average PERCENTAGE of output bits changed.
 *
 * @param {{ averages:object }} batchResult  Output of avalancheBatch()
 * @returns {{ labels:string[], values:number[], changedBits:number[] }}
 */
export function toChartData(batchResult) {
  const labels = ALGORITHMS.slice();
  const values = labels.map((name) => batchResult.averages[name].avgPercent);
  const changedBits = labels.map((name) => batchResult.averages[name].avgChangedBits);
  return { labels, values, changedBits };
}