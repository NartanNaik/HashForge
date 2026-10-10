/**
 * ============================================================================
 *  File    : tests/xorHash.test.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Unit tests for js/core/xorHash.js (Slides 6 and 7)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Automated tests for the simple XOR hash, using Node's built-in runner.
 *  Run all tests:   npm test
 *  Run this file:   node --test tests/xorHash.test.js
 *
 *  WHAT I TESTED
 *  -------------
 *  1. Known vectors (hand-calculated, so they do not depend on our code)
 *       - THE SLIDE EXAMPLE: "HI" with 1-byte blocks:
 *         01001000 ^ 01001001 = 00000001.
 *       - "HI" with 2-byte blocks is one block, so the hash is 0x4849.
 *       - "ABC" with 2-byte blocks: zero padding, 0x4142 ^ 0x4300 = 0x0242.
 *       - "ABCDEFGH" with 4-byte blocks = 0x0404040C.
 *       - Default block size (2 bytes) is used when none is given.
 *       - Empty message gives an all-zero hash of the right length.
 *       - With appendLength = true, "HI" (2-byte blocks) = 0x4859, because
 *         the 64-bit length field (16 bits = 0x10) is XORed in too.
 *  2. Properties that make XOR weak (Slide 7)
 *       - Output is always blockBytes long.
 *       - ORDER DOES NOT MATTER: "HI" and "IH" give the same hash; random
 *         shuffles of blocks never change the hash.
 *       - Repeating a message twice (M || M) gives the all-zero hash.
 *       - Linearity: hash(A) ^ hash(B) = hash(A ^ B) for equal-length data.
 *       - Flipping any single input bit changes EXACTLY one output bit.
 *  3. xorHashSteps (used by the visualizer)
 *       - steps[i].result = steps[i].previous ^ steps[i].block.
 *       - The first step starts from zeros, each step starts from the
 *         previous result, and the last result equals the final hash.
 *       - hash from xorHashSteps equals hash from xorHash.
 *       - Empty message: no blocks, no steps, zero hash.
 *  4. Safety
 *       - Input arrays are never modified.
 *
 *  ASSUMPTIONS (please check)
 *  --------------------------
 *  Written against the header of xorHash.js: xorHash(bytes, blockBytes,
 *  appendLength) returns a Uint8Array, and xorHashSteps returns
 *  { blocks, steps: [{ index, block, previous, result }], hash }.
 *  package.json must contain  "type": "module".
 *
 *  DEPENDS : js/core/xorHash.js, js/core/bitUtils.js, node:test, node:assert
 * ============================================================================
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { xorHash, xorHashSteps } from '../js/core/xorHash.js';
import {
  textToBytes,
  bytesToHex,
  bytesToBinaryString,
  hexToBytes,
  xorBytes,
  hammingDistance,
  flipBit,
} from '../js/core/bitUtils.js';

/* ------------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------------ */

/** Small repeatable random generator, so a failing test can be re-run. */
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

/** Compare two byte arrays (Uint8Array or plain) by value. */
function assertBytesEqual(actual, expected, message) {
  assert.deepEqual(Array.from(actual), Array.from(expected), message);
}

const hex = (bytes) => bytesToHex(bytes);

/* ------------------------------------------------------------------------ *
 *  1. Known vectors
 * ------------------------------------------------------------------------ */

describe('xorHash: known vectors', () => {
  test('SLIDE EXAMPLE: "HI" with 1-byte blocks = 00000001', () => {
    const hash = xorHash(textToBytes('HI'), 1);
    assert.equal(bytesToBinaryString(hash), '00000001');
    assert.equal(hex(hash), '01');
  });

  test('"HI" with 2-byte blocks is a single block: 0x4849', () => {
    assert.equal(hex(xorHash(textToBytes('HI'), 2)), '4849');
  });

  test('default block size is 2 bytes', () => {
    const hash = xorHash(textToBytes('HI'));
    assert.equal(hash.length, 2);
    assert.equal(hex(hash), '4849');
  });

  test('"ABC" with 2-byte blocks: zero-padded, 0x4142 ^ 0x4300 = 0x0242', () => {
    assert.equal(hex(xorHash(textToBytes('ABC'), 2)), '0242');
  });

  test('"ABCDEFGH" with 4-byte blocks = 0x0404040C', () => {
    assert.equal(hex(xorHash(textToBytes('ABCDEFGH'), 4)), '0404040c');
  });

  test('empty message gives an all-zero hash of blockBytes length', () => {
    for (const blockBytes of [1, 2, 4, 16]) {
      const hash = xorHash(new Uint8Array(0), blockBytes);
      assert.equal(hash.length, blockBytes);
      assert.ok(hash.every((b) => b === 0));
    }
  });

  test('appendLength = true: "HI" (2-byte blocks) = 0x4859', () => {
    // blocks: 4849, 0000, 0000, 0000, 0010  ->  4849 ^ 0010 = 4859
    assert.equal(hex(xorHash(textToBytes('HI'), 2, true)), '4859');
  });

  test('appendLength = false is the same as leaving it out', () => {
    const msg = textToBytes('Hash Forge');
    assertBytesEqual(xorHash(msg, 2, false), xorHash(msg, 2));
  });
});

/* ------------------------------------------------------------------------ *
 *  2. Properties (why XOR is weak)
 * ------------------------------------------------------------------------ */

describe('xorHash: properties', () => {
  test('output length is always blockBytes', () => {
    const rng = mulberry32(1);
    for (const blockBytes of [1, 2, 4, 8, 16]) {
      for (const length of [0, 1, 5, 16, 33]) {
        const hash = xorHash(randomBytes(rng, length), blockBytes);
        assert.equal(hash.length, blockBytes);
      }
    }
  });

  test('ORDER DOES NOT MATTER: "HI" and "IH" give the same hash', () => {
    assertBytesEqual(
      xorHash(textToBytes('HI'), 1),
      xorHash(textToBytes('IH'), 1),
    );
  });

  test('shuffling the blocks of random messages never changes the hash', () => {
    const rng = mulberry32(2);
    for (const blockBytes of [1, 2, 4, 8]) {
      for (let trial = 0; trial < 30; trial++) {
        const blocks = Array.from({ length: 6 }, () => randomBytes(rng, blockBytes));
        // Fisher-Yates shuffle with our repeatable generator.
        const shuffled = blocks.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const join = (list) => Uint8Array.from(list.flatMap((b) => Array.from(b)));
        assertBytesEqual(
          xorHash(join(blocks), blockBytes),
          xorHash(join(shuffled), blockBytes),
        );
      }
    }
  });

  test('swapping two different blocks keeps the hash (the collision trick)', () => {
    const msg = textToBytes('ABCDEFGH'); // blocks AB CD EF GH
    const swapped = textToBytes('CDABEFGH');
    assert.notDeepEqual(Array.from(msg), Array.from(swapped));
    assertBytesEqual(xorHash(msg, 2), xorHash(swapped, 2));
  });

  test('M || M (the message repeated) gives the all-zero hash', () => {
    const rng = mulberry32(3);
    for (const blockBytes of [1, 2, 4, 8]) {
      const half = randomBytes(rng, blockBytes * 3); // block aligned
      const doubled = Uint8Array.from([...half, ...half]);
      assert.ok(xorHash(doubled, blockBytes).every((b) => b === 0));
    }
  });

  test('linearity: hash(A) ^ hash(B) = hash(A ^ B) for equal-length data', () => {
    const rng = mulberry32(4);
    for (const blockBytes of [1, 2, 4, 16]) {
      for (let trial = 0; trial < 20; trial++) {
        const a = randomBytes(rng, blockBytes * 4);
        const b = randomBytes(rng, blockBytes * 4);
        assertBytesEqual(
          xorBytes(xorHash(a, blockBytes), xorHash(b, blockBytes)),
          xorHash(xorBytes(a, b), blockBytes),
        );
      }
    }
  });

  test('flipping ANY single input bit changes EXACTLY one output bit', () => {
    const msg = textToBytes('Pay Alice 100'); // 13 bytes -> 104 bits
    const before = xorHash(msg, 2);
    for (let bit = 0; bit < msg.length * 8; bit++) {
      const after = xorHash(flipBit(msg, bit), 2);
      assert.equal(hammingDistance(before, after), 1, `bit ${bit}`);
    }
  });

  test('a longer random message still has the 1-bit avalanche (16-byte blocks)', () => {
    const rng = mulberry32(5);
    const msg = randomBytes(rng, 100);
    const before = xorHash(msg, 16);
    for (let trial = 0; trial < 50; trial++) {
      const bit = Math.floor(rng() * msg.length * 8);
      assert.equal(hammingDistance(before, xorHash(flipBit(msg, bit), 16)), 1);
    }
  });
});

/* ------------------------------------------------------------------------ *
 *  3. xorHashSteps
 * ------------------------------------------------------------------------ */

describe('xorHashSteps', () => {
  test('"HI" with 1-byte blocks: two steps ending in 00000001', () => {
    const run = xorHashSteps(textToBytes('HI'), 1);
    assert.equal(run.blocks.length, 2);
    assert.equal(run.steps.length, 2);

    assert.equal(run.steps[0].index, 0);
    assert.equal(hex(run.steps[0].previous), '00');
    assert.equal(hex(run.steps[0].block), '48');
    assert.equal(hex(run.steps[0].result), '48');

    assert.equal(run.steps[1].index, 1);
    assert.equal(hex(run.steps[1].previous), '48');
    assert.equal(hex(run.steps[1].block), '49');
    assert.equal(hex(run.steps[1].result), '01');

    assert.equal(hex(run.hash), '01');
  });

  test('every step: result = previous ^ block, and steps are chained', () => {
    const rng = mulberry32(6);
    const msg = randomBytes(rng, 37);
    const run = xorHashSteps(msg, 4);

    assert.ok(run.steps.every((s) => s.previous.length === 4));
    assert.ok(run.steps[0].previous.every((b) => b === 0), 'starts from zeros');

    run.steps.forEach((step, i) => {
      assertBytesEqual(step.result, xorBytes(step.previous, step.block));
      assertBytesEqual(step.block, run.blocks[i]);
      if (i > 0) assertBytesEqual(step.previous, run.steps[i - 1].result);
    });
    assertBytesEqual(run.steps[run.steps.length - 1].result, run.hash);
  });

  test('hash from xorHashSteps equals hash from xorHash', () => {
    const rng = mulberry32(7);
    for (const blockBytes of [1, 2, 4, 8, 16]) {
      const msg = randomBytes(rng, 50);
      assertBytesEqual(xorHashSteps(msg, blockBytes).hash, xorHash(msg, blockBytes));
    }
  });

  test('appendLength is passed through to the steps too', () => {
    const msg = textToBytes('HI');
    const run = xorHashSteps(msg, 2, true);
    assert.equal(run.blocks.length, 5);
    assert.equal(hex(run.hash), '4859');
    assertBytesEqual(run.hash, xorHash(msg, 2, true));
  });

  test('empty message: no blocks, no steps, zero hash', () => {
    const run = xorHashSteps(new Uint8Array(0), 2);
    assert.equal(run.blocks.length, 0);
    assert.equal(run.steps.length, 0);
    assertBytesEqual(run.hash, [0, 0]);
  });
});

/* ------------------------------------------------------------------------ *
 *  4. Safety
 * ------------------------------------------------------------------------ */

describe('xorHash: does not modify its input', () => {
  test('xorHash and xorHashSteps leave the message untouched', () => {
    const input = hexToBytes('48 49 4a 4b 4c');
    const copy = Uint8Array.from(input);
    xorHash(input, 2);
    xorHashSteps(input, 2);
    assertBytesEqual(input, copy);
  });
});