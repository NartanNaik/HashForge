/**
 * ============================================================================
 *  File    : js/attacks/collision.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Collision Finder (supports Slides 7, 9 and 10)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure logic (no DOM). A COLLISION means two DIFFERENT messages that produce
 *  the SAME hash value. This file finds collisions for three hash functions
 *  and shows how very different their difficulty is:
 *
 *    - XOR      : instant. XOR is commutative (a ^ b == b ^ a), so simply
 *                 swapping two different blocks gives a new message with the
 *                 identical hash.
 *    - RXOR     : instant too. The rotation breaks the "swap blocks" trick,
 *                 but the forgery construction (append one correcting block)
 *                 still forces any message to hit any target hash.
 *    - SHA-256  : infeasible at full size. We can only demonstrate it on a
 *                 TRUNCATED SHA-256 (8-32 bits) with a brute-force BIRTHDAY
 *                 search, and the work grows like 2^(bits/2).
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. xorBlockSwapCollision(msgBytes, blockBytes)
 *       Splits the message into blocks, finds two blocks that differ, swaps
 *       them, and returns the new message together with both XOR hashes
 *       (which are equal) and a `collides` flag.
 *
 *  2. rxorCollision(msgBytes, blockBytes, otherBytes)
 *       Builds a different message with the same RXOR hash. Takes `otherBytes`
 *       (or, if omitted, the original with its first bit flipped) and uses
 *       forgeRxor() to append the correcting block so that its RXOR hash
 *       equals the hash of `msgBytes`.
 *
 *  3. birthdayCollisionSha(bits, options)   [async]
 *       Brute-force collision search on SHA-256 truncated to 8/16/24/32 bits.
 *       Hashes "msg-0", "msg-1", ... and stores each truncated hash until two
 *       different inputs repeat one. Runs in chunks and yields to the browser
 *       so the UI never freezes. Supports a progress callback and an
 *       AbortSignal for a Cancel button.
 *
 *  4. birthdaySweep(bitsList, options)   [async]
 *       Runs birthdayCollisionSha() for several sizes (default 8,16,24,32)
 *       and returns all results, ready for the "attempts vs hash size" chart.
 *
 *  Internal helpers: toBlocks(), joinBlocks(), bytesEqual(), nextFrame().
 *
 *  HOW MANY ATTEMPTS TO EXPECT (birthday paradox)
 *  ----------------------------------------------
 *    expected attempts ~ 1.2533 * 2^(bits/2)
 *      8 bits  -> about 20          16 bits -> about 321
 *     24 bits  -> about 5,100       32 bits -> about 82,000
 *  Real SHA-256 (256 bits) would need about 2^128 attempts: impossible.
 *
 *  EXPECTED SIGNATURES FROM OTHER FILES (to be written next)
 *  ---------------------------------------------------------
 *    bitUtils.js : textToBytes(str) -> Uint8Array
 *                  bytesToHex(bytes) -> string
 *                  flipBit(bytes, index) -> Uint8Array (new array)
 *    padding.js  : splitIntoBlocks(bytes, blockBytes) -> Uint8Array[]
 *                  (zero-pads the final partial block)
 *    xorHash.js  : xorHash(bytes, blockBytes)  -> Uint8Array
 *    rxorHash.js : rxorHash(bytes, blockBytes) -> Uint8Array
 *    sha256.js   : sha256Truncated(bytes, bits) -> Promise<Uint8Array>
 *    forgery.js  : forgeRxor(msgBytes, targetHash, blockBytes)
 *                    -> { paddedMessage, appendedBlock, finalMessage, finalHash }
 *
 *  USED BY : js/ui/collisionView.js, js/charts/charts.js, tests/collision.test.js
 *  DEPENDS : core/*, attacks/forgery.js
 * ============================================================================
 */

import { textToBytes, bytesToHex, flipBit } from '../core/bitUtils.js';
import { splitIntoBlocks } from '../core/padding.js';
import { xorHash } from '../core/xorHash.js';
import { rxorHash } from '../core/rxorHash.js';
import { sha256Truncated } from '../core/sha256.js';
import { forgeRxor } from './forgery.js';

/** Default demo block size: 2 bytes = 16-bit XOR/RXOR hash. */
const DEFAULT_BLOCK_BYTES = 2;

/** Truncated SHA-256 sizes allowed for the birthday demo. */
const ALLOWED_SHA_BITS = [8, 16, 24, 32];

/** Attempts between UI yields during the birthday search. */
const CHUNK_SIZE = 2000;

/** Safety limit so a bad call can never run forever. */
const DEFAULT_MAX_ATTEMPTS = 5_000_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compare two byte arrays for equality. */
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Split bytes into zero-padded blocks of `blockBytes`. */
function toBlocks(bytes, blockBytes) {
  if (!Number.isInteger(blockBytes) || blockBytes < 1) {
    throw new Error('blockBytes must be a positive integer');
  }
  return splitIntoBlocks(Uint8Array.from(bytes), blockBytes);
}

/** Join an array of blocks back into one byte array. */
function joinBlocks(blocks) {
  const total = blocks.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

/** Let the browser repaint / handle events between chunks of heavy work. */
function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// 1. XOR collision: swap two different blocks
// ---------------------------------------------------------------------------

/**
 * Create a DIFFERENT message with the SAME XOR hash by swapping two blocks.
 *
 * Why it works: h = B1 ^ B2 ^ ... ^ Bm, and XOR is commutative, so the order
 * of the blocks does not matter.
 *
 * @param {Uint8Array|number[]} msgBytes  Original message
 * @param {number} blockBytes             Block size in bytes (default 2)
 * @returns {{
 *   original:Uint8Array, collision:Uint8Array, swapped:[number, number],
 *   hashOriginal:Uint8Array, hashCollision:Uint8Array,
 *   differs:boolean, collides:boolean, method:string
 * }}
 * @throws {Error} if the message has fewer than two different blocks
 */
export function xorBlockSwapCollision(msgBytes, blockBytes = DEFAULT_BLOCK_BYTES) {
  const blocks = toBlocks(msgBytes, blockBytes);

  // Find the first pair of blocks (i < j) that are not identical.
  let pair = null;
  for (let i = 0; i < blocks.length && !pair; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (!bytesEqual(blocks[i], blocks[j])) {
        pair = [i, j];
        break;
      }
    }
  }
  if (!pair) {
    throw new Error(
      `Need at least two different blocks to swap. Use a longer message ` +
        `(more than ${blockBytes} bytes) with different content.`
    );
  }

  const swappedBlocks = blocks.map((b) => Uint8Array.from(b));
  [swappedBlocks[pair[0]], swappedBlocks[pair[1]]] = [swappedBlocks[pair[1]], swappedBlocks[pair[0]]];

  const original = joinBlocks(blocks); // original message after zero-padding
  const collision = joinBlocks(swappedBlocks);

  const hashOriginal = xorHash(original, blockBytes);
  const hashCollision = xorHash(collision, blockBytes);

  return {
    original,
    collision,
    swapped: pair,
    hashOriginal,
    hashCollision,
    differs: !bytesEqual(original, collision),
    collides: bytesEqual(hashOriginal, hashCollision),
    method: 'block-swap',
  };
}

// ---------------------------------------------------------------------------
// 2. RXOR collision: use the forgery construction
// ---------------------------------------------------------------------------

/**
 * Create a DIFFERENT message with the SAME RXOR hash as `msgBytes`.
 *
 * Swapping blocks does not work for RXOR (rotation makes order matter), so we
 * use the forgery trick: take another message, then append one correcting
 * block so its hash equals the target hash.
 *
 * @param {Uint8Array|number[]} msgBytes     Original message (defines the target hash)
 * @param {number} blockBytes                Block size in bytes (default 2)
 * @param {Uint8Array|number[]|null} otherBytes
 *        The message to turn into a collision. If omitted, the original with
 *        its first bit flipped is used.
 * @returns {{
 *   original:Uint8Array, collision:Uint8Array, appendedBlock:Uint8Array,
 *   hashOriginal:Uint8Array, hashCollision:Uint8Array,
 *   differs:boolean, collides:boolean, method:string
 * }}
 */
export function rxorCollision(msgBytes, blockBytes = DEFAULT_BLOCK_BYTES, otherBytes = null) {
  if (!msgBytes || msgBytes.length === 0) {
    throw new Error('Message must contain at least one byte');
  }

  const original = Uint8Array.from(msgBytes);
  const hashOriginal = rxorHash(original, blockBytes);

  let other;
  if (otherBytes && otherBytes.length > 0) {
    other = Uint8Array.from(otherBytes);
  } else {
    const copy = Uint8Array.from(original);
    other = flipBit(copy, 0) ?? copy; // works if flipBit returns or mutates
  }

  const forged = forgeRxor(other, hashOriginal, blockBytes);
  const collision = forged.finalMessage;
  const hashCollision = rxorHash(collision, blockBytes);

  return {
    original,
    collision,
    appendedBlock: forged.appendedBlock,
    hashOriginal,
    hashCollision,
    differs: !bytesEqual(original, collision),
    collides: bytesEqual(hashOriginal, hashCollision),
    method: 'forgery',
  };
}

// ---------------------------------------------------------------------------
// 3. Birthday attack on truncated SHA-256
// ---------------------------------------------------------------------------

/**
 * Brute-force a collision on SHA-256 truncated to `bits` bits.
 *
 * Inputs are "msg-0", "msg-1", "msg-2", ... Each truncated hash is stored in a
 * Map; the first time a hash is seen again, the two inputs collide.
 *
 * @param {number} bits  8, 16, 24 or 32
 * @param {{
 *   onProgress?: (p:{attempts:number, elapsedMs:number}) => void,
 *   signal?: AbortSignal,
 *   maxAttempts?: number
 * }} [options]
 * @returns {Promise<{
 *   bits:number, attempts:number, elapsedMs:number,
 *   messageA:string, messageB:string, hashHex:string,
 *   expectedAttempts:number, found:boolean, cancelled:boolean
 * }>}
 */
export async function birthdayCollisionSha(bits, options = {}) {
  if (!ALLOWED_SHA_BITS.includes(bits)) {
    throw new Error(`bits must be one of: ${ALLOWED_SHA_BITS.join(', ')}`);
  }

  const { onProgress, signal, maxAttempts = DEFAULT_MAX_ATTEMPTS } = options;
  const expectedAttempts = Math.round(Math.sqrt((Math.PI / 2) * 2 ** bits));
  const seen = new Map(); // truncated hash (hex) -> counter that produced it
  const start = performance.now();

  let attempts = 0;
  let cancelled = false;

  while (attempts < maxAttempts) {
    if (signal && signal.aborted) {
      cancelled = true;
      break;
    }

    // Process one chunk, then yield to the browser.
    const chunkEnd = Math.min(attempts + CHUNK_SIZE, maxAttempts);
    while (attempts < chunkEnd) {
      const counter = attempts;
      const message = `msg-${counter}`;
      const digest = await sha256Truncated(textToBytes(message), bits);
      const key = bytesToHex(digest);
      attempts++;

      if (seen.has(key)) {
        const elapsedMs = performance.now() - start;
        return {
          bits,
          attempts,
          elapsedMs,
          messageA: `msg-${seen.get(key)}`,
          messageB: message,
          hashHex: key,
          expectedAttempts,
          found: true,
          cancelled: false,
        };
      }
      seen.set(key, counter);
    }

    if (onProgress) onProgress({ attempts, elapsedMs: performance.now() - start });
    await nextFrame();
  }

  return {
    bits,
    attempts,
    elapsedMs: performance.now() - start,
    messageA: '',
    messageB: '',
    hashHex: '',
    expectedAttempts,
    found: false,
    cancelled,
  };
}

/**
 * Run the birthday search for several hash sizes (for the growth chart).
 *
 * @param {number[]} bitsList  Sizes to test (default [8, 16, 24, 32])
 * @param {{
 *   onProgress?: Function,
 *   onResult?: (r:object) => void,
 *   signal?: AbortSignal
 * }} [options]
 * @returns {Promise<object[]>} One birthdayCollisionSha() result per size
 */
export async function birthdaySweep(bitsList = ALLOWED_SHA_BITS, options = {}) {
  const { onResult, ...rest } = options;
  const results = [];
  for (const bits of bitsList) {
    const result = await birthdayCollisionSha(bits, rest);
    results.push(result);
    if (onResult) onResult(result);
    if (result.cancelled) break;
  }
  return results;
}