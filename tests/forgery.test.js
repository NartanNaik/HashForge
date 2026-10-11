/**
 * ============================================================================
 *  File    : tests/forgery.test.js
 *  Project : Hash Forge
 *  Module  : Unit tests for js/attacks/forgery.js (Slide 10)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Automated tests for the forgery attack. The key claim of the whole project:
 *  for ANY forged message and ANY target hash, appending one correcting
 *  block makes the forged message hash to the target.
 *      XOR  : X = (XOR of all padded forged blocks) ^ T
 *      RXOR : X = ROL1(h') ^ T,   h' = RXOR hash of the padded forged message
 *  Run all tests:   npm test
 *  Run this file:   node --test tests/forgery.test.js
 *
 *  WHAT I TESTED  (for BOTH forgeXor and forgeRxor)
 *  ------------------------------------------------
 *  1. The main claim, on many random inputs
 *       - 50 random messages x random targets x every block size
 *         (1, 2, 4, 8, 16 bytes): the REAL hash of finalMessage, recomputed
 *         here with xorHash() / rxorHash(), equals the target.
 *       - result.finalHash also equals the target.
 *  2. Structure of the result
 *       - paddedMessage is a multiple of the block size and starts with the
 *         original forged bytes (zero padding only).
 *       - appendedBlock is exactly blockBytes long.
 *       - finalMessage = paddedMessage + appendedBlock.
 *       - The forged text is kept untouched at the front of finalMessage.
 *  3. The maths, calculated independently of forgery.js
 *       - XOR : appendedBlock = xorHash(padded) ^ target.
 *       - RXOR: appendedBlock = ROL1(rxorHash(padded)) ^ target.
 *  4. The Slide 10 scenario
 *       - "Pay Rs 100 to Bob" -> "Pay Rs 10000 to Eve" gets the original's
 *         hash, for both algorithms; the messages themselves are different.
 *  5. Edge cases and errors
 *       - Empty forged message works (the appended block is just the target).
 *       - A target of the wrong length throws.
 *       - Inputs are not modified; the same input gives the same output.
 *       - Optional fields (verified, appendedHex, paddingAdded) are checked
 *         only when forgery.js provides them.
 *  6. SHA-256 resists the same attack
 *       - The original and the forged message have different SHA-256 hashes,
 *         differing in roughly half of the 256 bits (we accept 64 to 192).
 *
 *  ASSUMPTIONS (please check)
 *  --------------------------
 *  I have not seen forgery.js, only its documented result:
 *    { paddedMessage, appendedBlock, finalMessage, finalHash }
 *  plus (from forgeryView.js) the optional fields appendedHex, verified,
 *  paddingAdded. Signature: forgeXor / forgeRxor(forgedBytes, targetHash,
 *  blockBytes). Zero padding with no length block (the default of the hash
 *  files). If the empty-message test fails because forgery.js rejects an
 *  empty message on purpose, change that one test to assert.throws.
 *  package.json must contain  "type": "module".
 *
 *  DEPENDS : js/attacks/forgery.js, js/core/xorHash.js, js/core/rxorHash.js,
 *            js/core/sha256.js, js/core/bitUtils.js, node:test, node:assert
 * ============================================================================
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { forgeXor, forgeRxor } from '../js/attacks/forgery.js';
import { xorHash } from '../js/core/xorHash.js';
import { rxorHash } from '../js/core/rxorHash.js';
import { sha256 } from '../js/core/sha256.js';
import {
  textToBytes,
  bytesToHex,
  xorBytes,
  rotateLeft1,
  hammingDistance,
} from '../js/core/bitUtils.js';

/* ------------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------------ */

const BLOCK_SIZES = [1, 2, 4, 8, 16];
const TRIALS = 50;

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

function assertBytesEqual(actual, expected, message) {
  assert.deepEqual(Array.from(actual), Array.from(expected), message);
}

/**
 * Both attacks, described once so every test runs for XOR and RXOR.
 *   correcting(padded, target, blockBytes) = the block the maths says to append
 */
const ALGORITHMS = [
  {
    name: 'XOR',
    forge: forgeXor,
    hash: xorHash,
    correcting: (padded, target, blockBytes) =>
      xorBytes(xorHash(padded, blockBytes), target),
  },
  {
    name: 'RXOR',
    forge: forgeRxor,
    hash: rxorHash,
    correcting: (padded, target, blockBytes) =>
      xorBytes(rotateLeft1(rxorHash(padded, blockBytes)), target),
  },
];

for (const algo of ALGORITHMS) {
  describe(`${algo.name} forgery`, () => {
    /* -------------------------------------------------------------------- *
     *  1. The main claim
     * -------------------------------------------------------------------- */

    test(`hash(forged) === target for ${TRIALS} random cases per block size`, () => {
      const rng = mulberry32(algo.name === 'XOR' ? 101 : 202);
      for (const blockBytes of BLOCK_SIZES) {
        for (let trial = 0; trial < TRIALS; trial++) {
          const forgedMsg = randomBytes(rng, 1 + Math.floor(rng() * 40));
          const target = randomBytes(rng, blockBytes);

          const result = algo.forge(forgedMsg, target, blockBytes);

          // Recompute with the REAL hash function, do not trust the result.
          assertBytesEqual(
            algo.hash(result.finalMessage, blockBytes),
            target,
            `${algo.name}, block ${blockBytes}, trial ${trial}`,
          );
          assertBytesEqual(result.finalHash, target);
        }
      }
    });

    /* -------------------------------------------------------------------- *
     *  2. Structure of the result
     * -------------------------------------------------------------------- */

    test('result structure: padding, appended block, final message', () => {
      const rng = mulberry32(algo.name === 'XOR' ? 103 : 204);
      for (const blockBytes of BLOCK_SIZES) {
        for (let trial = 0; trial < 20; trial++) {
          const forgedMsg = randomBytes(rng, 1 + Math.floor(rng() * 40));
          const target = randomBytes(rng, blockBytes);
          const r = algo.forge(forgedMsg, target, blockBytes);

          // paddedMessage: block aligned, starts with the forged bytes,
          // and only zero bytes were added.
          assert.equal(r.paddedMessage.length % blockBytes, 0);
          assert.ok(r.paddedMessage.length >= forgedMsg.length);
          assert.ok(r.paddedMessage.length - forgedMsg.length < blockBytes);
          assertBytesEqual(r.paddedMessage.slice(0, forgedMsg.length), forgedMsg);
          assert.ok(r.paddedMessage.slice(forgedMsg.length).every((b) => b === 0));

          // appendedBlock: exactly one block.
          assert.equal(r.appendedBlock.length, blockBytes);

          // finalMessage = paddedMessage + appendedBlock.
          assert.equal(r.finalMessage.length, r.paddedMessage.length + blockBytes);
          assertBytesEqual(r.finalMessage.slice(0, r.paddedMessage.length), r.paddedMessage);
          assertBytesEqual(r.finalMessage.slice(r.paddedMessage.length), r.appendedBlock);

          // The attacker's text is untouched at the front.
          assertBytesEqual(r.finalMessage.slice(0, forgedMsg.length), forgedMsg);
        }
      }
    });

    test('block-aligned forged message needs no padding', () => {
      const msg = textToBytes('ABCDEFGH');
      const r = algo.forge(msg, Uint8Array.from([1, 2]), 2);
      assertBytesEqual(r.paddedMessage, msg);
      assert.equal(r.finalMessage.length, msg.length + 2);
      if (r.paddingAdded !== undefined) assert.equal(r.paddingAdded, 0);
    });

    test('unaligned forged message is zero-padded (paddingAdded matches)', () => {
      const msg = textToBytes('ABCDE'); // 5 bytes, 2-byte blocks -> 1 zero byte
      const r = algo.forge(msg, Uint8Array.from([1, 2]), 2);
      assert.equal(r.paddedMessage.length, 6);
      assert.equal(r.paddedMessage[5], 0);
      if (r.paddingAdded !== undefined) assert.equal(r.paddingAdded, 1);
    });

    /* -------------------------------------------------------------------- *
     *  3. The maths, calculated independently
     * -------------------------------------------------------------------- */

    test('appended block equals the formula from the slides', () => {
      const rng = mulberry32(algo.name === 'XOR' ? 105 : 206);
      for (const blockBytes of BLOCK_SIZES) {
        for (let trial = 0; trial < 20; trial++) {
          const forgedMsg = randomBytes(rng, 1 + Math.floor(rng() * 40));
          const target = randomBytes(rng, blockBytes);
          const r = algo.forge(forgedMsg, target, blockBytes);
          assertBytesEqual(
            r.appendedBlock,
            algo.correcting(r.paddedMessage, target, blockBytes),
            `${algo.name}, block ${blockBytes}, trial ${trial}`,
          );
        }
      }
    });

    /* -------------------------------------------------------------------- *
     *  4. The Slide 10 scenario
     * -------------------------------------------------------------------- */

    test('"Pay Rs 100 to Bob" -> "Pay Rs 10000 to Eve" keeps the same hash', () => {
      const original = textToBytes('Pay Rs 100 to Bob');
      const forged = textToBytes('Pay Rs 10000 to Eve');

      for (const blockBytes of [1, 2, 4, 16]) {
        const target = algo.hash(original, blockBytes);
        const r = algo.forge(forged, target, blockBytes);

        assertBytesEqual(algo.hash(r.finalMessage, blockBytes), target);
        assert.notDeepEqual(Array.from(r.finalMessage), Array.from(original));
        assertBytesEqual(r.finalMessage.slice(0, forged.length), forged);
      }
    });

    /* -------------------------------------------------------------------- *
     *  5. Edge cases and errors
     * -------------------------------------------------------------------- */

    test('forged message equal to the original (target = its own hash)', () => {
      const msg = textToBytes('Pay Rs 100 to Bob');
      const target = algo.hash(msg, 2);
      const r = algo.forge(msg, target, 2);
      assertBytesEqual(algo.hash(r.finalMessage, 2), target);
    });

    test('empty forged message: the appended block is just the target', () => {
      const target = Uint8Array.from([0xab, 0xcd]);
      const r = algo.forge(new Uint8Array(0), target, 2);
      assertBytesEqual(algo.hash(r.finalMessage, 2), target);
      assertBytesEqual(r.appendedBlock, target); // h' = 0 for both algorithms
    });

    test('target hash of the wrong length throws', () => {
      assert.throws(() => algo.forge(textToBytes('hello'), new Uint8Array(4), 2));
      assert.throws(() => algo.forge(textToBytes('hello'), new Uint8Array(1), 2));
    });

    test('inputs are not modified', () => {
      const msg = textToBytes('Pay Rs 10000 to Eve');
      const target = Uint8Array.from([0x12, 0x34]);
      const msgCopy = Uint8Array.from(msg);
      const targetCopy = Uint8Array.from(target);
      algo.forge(msg, target, 2);
      assertBytesEqual(msg, msgCopy);
      assertBytesEqual(target, targetCopy);
    });

    test('same input gives the same output (deterministic)', () => {
      const msg = textToBytes('Pay Rs 10000 to Eve');
      const target = Uint8Array.from([0x12, 0x34]);
      const a = algo.forge(msg, target, 2);
      const b = algo.forge(msg, target, 2);
      assertBytesEqual(a.finalMessage, b.finalMessage);
      assertBytesEqual(a.appendedBlock, b.appendedBlock);
    });

    test('optional fields (verified, appendedHex) are consistent when present', () => {
      const msg = textToBytes('Pay Rs 10000 to Eve');
      const target = Uint8Array.from([0x12, 0x34]);
      const r = algo.forge(msg, target, 2);
      if (r.verified !== undefined) assert.equal(r.verified, true);
      if (r.appendedHex !== undefined) {
        assert.equal(r.appendedHex.replace(/\s+/g, '').toLowerCase(), bytesToHex(r.appendedBlock));
      }
      if (r.targetHash !== undefined) assertBytesEqual(r.targetHash, target);
      if (r.blockBytes !== undefined) assert.equal(r.blockBytes, 2);
    });

    /* -------------------------------------------------------------------- *
     *  6. SHA-256 resists the same attack
     * -------------------------------------------------------------------- */

    test('SHA-256 of original and forged messages is completely different', async () => {
      const original = textToBytes('Pay Rs 100 to Bob');
      const forged = textToBytes('Pay Rs 10000 to Eve');
      const target = algo.hash(original, 2);
      const r = algo.forge(forged, target, 2);

      const shaOriginal = await sha256(original);
      const shaForged = await sha256(r.finalMessage);

      assert.notEqual(bytesToHex(shaOriginal), bytesToHex(shaForged));
      const differing = hammingDistance(shaOriginal, shaForged);
      assert.ok(
        differing > 64 && differing < 192,
        `expected roughly half of 256 bits to differ, got ${differing}`,
      );
    });
  });
}