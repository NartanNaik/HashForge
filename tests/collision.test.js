/**
 * ============================================================================
 *  File    : tests/collision.test.js
 *  Project : Hash Forge
 *  Module  : Unit tests for js/attacks/collision.js (Slides 7, 9 and 10)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Automated tests for the collision finders. A collision is two DIFFERENT
 *  messages with the SAME hash.
 *  Run all tests:   npm test
 *  Run this file:   node --test tests/collision.test.js
 *
 *  WHAT I TESTED
 *  -------------
 *  1. xorBlockSwapCollision
 *       - The new message is DIFFERENT from the original but has the SAME XOR
 *         hash (recomputed here with the real xorHash(), not trusted from
 *         the result). Checked for every block size.
 *       - It has the same length as the original (padded) message.
 *       - Works when the message is not block aligned (zero padding).
 *       - Throws when there are not two different blocks to swap (a single
 *         block, or a message whose blocks are all identical).
 *       - The input is not modified; the `collides` flag is true if given.
 *  2. rxorCollision
 *       - With an `otherBytes` message: the result differs from the original
 *         but has the same RXOR hash, and starts with `otherBytes`.
 *       - Without `otherBytes`: still a different message with the same hash.
 *       - Works for every block size and many random messages.
 *       - CONTRAST: swapping two blocks does NOT keep the RXOR hash, which
 *         is why a different construction (forgery) is needed.
 *  3. birthdayCollisionSha (truncated SHA-256)
 *       - Finds a collision for 8 and 16 bits (found = true).
 *       - Attempts obey the pigeonhole limit (at most 2^bits + 1), are at
 *         least 2, and 16 bits needs far fewer than 2^16 attempts (the
 *         birthday effect).
 *       - expectedAttempts is about 1.2533 * 2^(bits/2) (checked if given).
 *       - elapsedMs is a non-negative number; the search is deterministic
 *         ("msg-0", "msg-1", ...), so two runs give the same attempts.
 *       - An already-aborted AbortSignal stops the search (it either rejects
 *         with AbortError or returns without found = true).
 *  4. birthdaySweep
 *       - One result per requested size, in order, each with bits and found.
 *
 *  ASSUMPTIONS (please check)
 *  --------------------------
 *  I wrote this against the header of collision.js, not its code. The exact
 *  field NAME of the new message is not documented, so findMessage() below
 *  tries the likely names and then falls back to "any byte array in the
 *  result that is different from the original". If a test says "no colliding
 *  message found in the result", add the real field name to MESSAGE_FIELDS.
 *  The sizes tested for the birthday search are 8 and 16 bits to keep the
 *  test run fast. I did not test onProgress, because a short search may
 *  finish before the first progress report.
 *  package.json must contain  "type": "module".
 *
 *  DEPENDS : js/attacks/collision.js, js/core/xorHash.js, js/core/rxorHash.js,
 *            js/core/padding.js, js/core/bitUtils.js, node:test, node:assert
 * ============================================================================
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  xorBlockSwapCollision,
  rxorCollision,
  birthdayCollisionSha,
  birthdaySweep,
} from '../js/attacks/collision.js';
import { xorHash } from '../js/core/xorHash.js';
import { rxorHash } from '../js/core/rxorHash.js';
import { splitIntoBlocks } from '../js/core/padding.js';
import { textToBytes } from '../js/core/bitUtils.js';

/* ------------------------------------------------------------------------ *
 *  Helpers (the guesses about collision.js live here)
 * ------------------------------------------------------------------------ */

const BLOCK_SIZES = [1, 2, 4, 8, 16];

/** Likely names of the new message in the result. Add the real one if needed. */
const MESSAGE_FIELDS = [
  'finalMessage', 'swappedMessage', 'collidingMessage', 'collisionMessage',
  'newMessage', 'forgedMessage', 'message',
];

const IGNORED_FIELDS = ['swapped', 'swappedIndices', 'indices', 'blocksSwapped'];

function zeroPad(bytes, blockBytes) {
  const rest = bytes.length % blockBytes;
  if (rest === 0) return Uint8Array.from(bytes);
  const out = new Uint8Array(bytes.length + blockBytes - rest);
  out.set(bytes);
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(rng, length) {
  return Uint8Array.from({ length }, () => Math.floor(rng() * 256));
}

const sameBytes = (a, b) =>
  a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

function assertBytesEqual(actual, expected, message) {
  assert.deepEqual(Array.from(actual), Array.from(expected), message);
}

const isByteArray = (v) =>
  v instanceof Uint8Array || (Array.isArray(v) && v.every((n) => Number.isInteger(n)));

/** Finds the colliding message inside whatever collision.js returned. */
function findMessage(result, original, blockBytes, mode) {
  if (isByteArray(result)) return Uint8Array.from(result);

  const padded = zeroPad(original, blockBytes);
  const candidates = [];
  for (const [key, value] of Object.entries(result ?? {})) {
    if (IGNORED_FIELDS.includes(key) || !isByteArray(value)) continue;
    const bytes = Uint8Array.from(value);
    if (sameBytes(bytes, original) || sameBytes(bytes, padded)) continue;
    if (mode === 'swap' && bytes.length !== padded.length) continue;
    if (mode === 'append' && bytes.length < 2 * blockBytes) continue;
    candidates.push({ key, bytes });
  }
  const rank = (key) => {
    const i = MESSAGE_FIELDS.indexOf(key);
    return i === -1 ? 999 : i;
  };
  candidates.sort((a, b) => b.bytes.length - a.bytes.length || rank(a.key) - rank(b.key));

  if (candidates.length === 0) {
    assert.fail(`no colliding message found; result fields: ${Object.keys(result ?? {}).join(', ')}`);
  }
  return candidates[0].bytes;
}

/* ------------------------------------------------------------------------ *
 *  1. xorBlockSwapCollision
 * ------------------------------------------------------------------------ */

describe('xorBlockSwapCollision', () => {
  test('different message, SAME XOR hash (every block size)', () => {
    const rng = mulberry32(21);
    for (const blockBytes of BLOCK_SIZES) {
      for (let trial = 0; trial < 20; trial++) {
        const msg = randomBytes(rng, blockBytes * 6); // 6 random blocks
        const result = xorBlockSwapCollision(msg, blockBytes);
        const other = findMessage(result, msg, blockBytes, 'swap');

        assert.ok(!sameBytes(other, msg), 'the messages must differ');
        assertBytesEqual(
          xorHash(other, blockBytes),
          xorHash(msg, blockBytes),
          `block ${blockBytes}, trial ${trial}`,
        );
        if (result.collides !== undefined) assert.equal(result.collides, true);
      }
    }
  });

  test('readable example: "PAY ALICE 100 RUPEES NOW" with 2-byte blocks', () => {
    const msg = textToBytes('PAY ALICE 100 RUPEES NOW');
    const other = findMessage(xorBlockSwapCollision(msg, 2), msg, 2, 'swap');
    assert.ok(!sameBytes(other, msg));
    assert.equal(other.length, msg.length);
    assertBytesEqual(xorHash(other, 2), xorHash(msg, 2));
  });

  test('message that is not block aligned (zero padding) still collides', () => {
    const msg = textToBytes('HELLO WORLD'); // 11 bytes, 2-byte blocks -> padded to 12
    const other = findMessage(xorBlockSwapCollision(msg, 2), msg, 2, 'swap');
    assert.ok(!sameBytes(other, msg));
    assertBytesEqual(xorHash(other, 2), xorHash(msg, 2));
  });

  test('the new message is a rearrangement of the same blocks', () => {
    const msg = textToBytes('ABCDEFGH');
    const other = findMessage(xorBlockSwapCollision(msg, 2), msg, 2, 'swap');
    const sortKey = (blocks) => blocks.map((b) => Array.from(b).join(',')).sort();
    assert.deepEqual(
      sortKey(splitIntoBlocks(other, 2)),
      sortKey(splitIntoBlocks(msg, 2)),
    );
  });

  test('throws when there is only one block', () => {
    assert.throws(() => xorBlockSwapCollision(textToBytes('HI'), 2));
  });

  test('throws when all blocks are identical (nothing to swap)', () => {
    assert.throws(() => xorBlockSwapCollision(textToBytes('ABABABAB'), 2));
  });

  test('does not modify the input message', () => {
    const msg = textToBytes('ABCDEFGH');
    const copy = Uint8Array.from(msg);
    xorBlockSwapCollision(msg, 2);
    assertBytesEqual(msg, copy);
  });
});

/* ------------------------------------------------------------------------ *
 *  2. rxorCollision
 * ------------------------------------------------------------------------ */

describe('rxorCollision', () => {
  test('with otherBytes: different message, SAME RXOR hash, starts with it', () => {
    const blockBytes = 2;
    const msg = textToBytes('Pay Rs 100 to Bob');
    const otherBytes = textToBytes('Pay Rs 10000 to Eve');
    const result = rxorCollision(msg, blockBytes, otherBytes);
    // The result is otherBytes + padding + one extra block, so it is longer.
    const colliding = findMessage(result, msg, blockBytes, 'append');

    assert.ok(!sameBytes(colliding, msg));
    assertBytesEqual(rxorHash(colliding, blockBytes), rxorHash(msg, blockBytes));
    assertBytesEqual(colliding.slice(0, otherBytes.length), otherBytes);
    if (result.collides !== undefined) assert.equal(result.collides, true);
  });

  test('without otherBytes: still a different message with the same hash', () => {
    const blockBytes = 2;
    const msg = textToBytes('Pay Rs 100 to Bob');
    const result = rxorCollision(msg, blockBytes);
    const colliding = findMessage(result, msg, blockBytes, 'append');

    assert.ok(!sameBytes(colliding, msg));
    assertBytesEqual(rxorHash(colliding, blockBytes), rxorHash(msg, blockBytes));
  });

  test('works for every block size on random messages', () => {
    const rng = mulberry32(22);
    for (const blockBytes of BLOCK_SIZES) {
      for (let trial = 0; trial < 20; trial++) {
        const msg = randomBytes(rng, 1 + Math.floor(rng() * 40));
        const otherBytes = randomBytes(rng, 1 + Math.floor(rng() * 40));
        const colliding = findMessage(rxorCollision(msg, blockBytes, otherBytes), msg, blockBytes, 'append');
        assertBytesEqual(
          rxorHash(colliding, blockBytes),
          rxorHash(msg, blockBytes),
          `block ${blockBytes}, trial ${trial}`,
        );
      }
    }
  });

  test('CONTRAST: swapping two blocks does NOT keep the RXOR hash', () => {
    // "ABCDEFGH" blocks AB CD EF GH; swap CD and EF -> "ABEFCDGH".
    const original = textToBytes('ABCDEFGH');
    const swapped = textToBytes('ABEFCDGH');
    assert.notDeepEqual(Array.from(original), Array.from(swapped));
    assert.notDeepEqual(
      Array.from(rxorHash(original, 2)),
      Array.from(rxorHash(swapped, 2)),
    );
    // ...whereas plain XOR is fooled by exactly the same swap.
    assertBytesEqual(xorHash(original, 2), xorHash(swapped, 2));
  });

  test('does not modify its inputs', () => {
    const msg = textToBytes('Pay Rs 100 to Bob');
    const other = textToBytes('Pay Rs 10000 to Eve');
    const msgCopy = Uint8Array.from(msg);
    const otherCopy = Uint8Array.from(other);
    rxorCollision(msg, 2, other);
    assertBytesEqual(msg, msgCopy);
    assertBytesEqual(other, otherCopy);
  });
});

/* ------------------------------------------------------------------------ *
 *  3. birthdayCollisionSha (truncated SHA-256)
 * ------------------------------------------------------------------------ */

describe('birthdayCollisionSha', () => {
  test('8 bits: finds a collision within the pigeonhole limit', async () => {
    const r = await birthdayCollisionSha(8);
    assert.equal(r.found, true);
    assert.ok(r.attempts >= 2, 'a collision needs at least two messages');
    assert.ok(r.attempts <= 2 ** 8 + 1, `attempts ${r.attempts} exceeds 2^8 + 1`);
  });

  test('16 bits: finds a collision, far below 2^16 attempts (birthday effect)', async () => {
    const r = await birthdayCollisionSha(16);
    assert.equal(r.found, true);
    assert.ok(r.attempts >= 2);
    assert.ok(r.attempts < 5000, `expected about 321 attempts, got ${r.attempts}`);
  });

  test('expectedAttempts is about 1.2533 * 2^(bits/2) (if reported)', async () => {
    for (const bits of [8, 16]) {
      const r = await birthdayCollisionSha(bits);
      if (r.expectedAttempts === undefined) continue;
      const bound = 1.2533 * 2 ** (bits / 2);
      assert.ok(
        Math.abs(r.expectedAttempts - bound) / bound < 0.05,
        `bits ${bits}: expected ~${bound.toFixed(1)}, got ${r.expectedAttempts}`,
      );
    }
  });

  test('elapsedMs is a non-negative number', async () => {
    const r = await birthdayCollisionSha(8);
    assert.equal(typeof r.elapsedMs, 'number');
    assert.ok(r.elapsedMs >= 0);
  });

  test('deterministic: two runs give the same number of attempts', async () => {
    const a = await birthdayCollisionSha(8);
    const b = await birthdayCollisionSha(8);
    assert.equal(a.attempts, b.attempts);
  });

  test('an already-aborted signal stops the search', async () => {
    const controller = new AbortController();
    controller.abort();

    let outcome;
    try {
      outcome = await birthdayCollisionSha(32, { signal: controller.signal });
    } catch (err) {
      assert.equal(err.name, 'AbortError');
      return; // rejecting with AbortError is a valid way to cancel
    }
    assert.notEqual(outcome.found, true, 'a cancelled search must not report found');
  });
});

/* ------------------------------------------------------------------------ *
 *  4. birthdaySweep
 * ------------------------------------------------------------------------ */

describe('birthdaySweep', () => {
  test('one result per requested size, in order', async () => {
    const results = await birthdaySweep([8, 16]);
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((r) => r.bits), [8, 16]);
    for (const r of results) {
      assert.equal(r.found, true);
      assert.ok(r.attempts >= 2);
    }
  });
});