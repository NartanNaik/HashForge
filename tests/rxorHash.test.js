/**
 * ============================================================================
 *  File    : tests/rxorHash.test.js
 *  Project : Hash Forge
 *  Module  : Unit tests for js/core/rxorHash.js (Slides 8 and 9)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Automated tests for the Rotated XOR hash:
 *      h = 0;   for each block Bi:   h = ROL1(h) ^ Bi
 *  Run all tests:   npm test
 *  Run this file:   node --test tests/rxorHash.test.js
 *
 *  WHAT I TESTED
 *  -------------
 *  1. Known vectors (hand-calculated)
 *       - "HI" with 1-byte blocks = 11011001 (0xD9); plain XOR gives 0x01.
 *       - "IH" = 0xDA, so ORDER MATTERS (the property XOR does not have).
 *       - "ABC" with 1-byte blocks = 0xC2 (three rotate-then-XOR steps).
 *       - The rotation is over the WHOLE n-bit value: with 2-byte blocks,
 *         blocks 0x8000 then 0x0000 give 0x0001 (the top bit wraps round).
 *       - A single block: RXOR equals XOR (rotating zero changes nothing).
 *       - Default block size (2 bytes), empty message (zeros), and
 *         appendLength = true.
 *  2. Order sensitivity (Slide 9)
 *       - Swapping two different blocks changes the hash in most cases, so
 *         the "swap blocks" collision trick of XOR no longer works.
 *  3. What is STILL weak
 *       - Linearity: hash(A) ^ hash(B) = hash(A ^ B).
 *       - Flipping any single input bit changes EXACTLY one output bit (the
 *         rotation only MOVES the changed bit).
 *       - Where the changed bit lands: a flip in block j (of m blocks, bit
 *         position p inside the block) shows up at position
 *         (p - (m - 1 - j)) mod n, which proves it is "only moved".
 *  4. rxorHashSteps (used by the visualizer)
 *       - rotated = ROL1(previous) and result = rotated ^ block at every
 *         step, steps are chained, and the last result is the final hash.
 *       - The "HI" example step by step (0x90 rotated, 0xD9 result).
 *       - hash from rxorHashSteps equals hash from rxorHash.
 *       - Empty message: no blocks, no steps, zero hash.
 *  5. Safety
 *       - Input arrays are never modified.
 *
 *  ASSUMPTIONS (please check)
 *  --------------------------
 *  Written against the header of rxorHash.js: rxorHash(bytes, blockBytes,
 *  appendLength) returns a Uint8Array, and rxorHashSteps returns
 *  { blocks, steps: [{ index, block, previous, rotated, result }], hash }.
 *  package.json must contain  "type": "module".
 *
 *  DEPENDS : js/core/rxorHash.js, js/core/xorHash.js, js/core/bitUtils.js,
 *            node:test, node:assert
 * ============================================================================
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rxorHash, rxorHashSteps } from '../js/core/rxorHash.js';
import { xorHash } from '../js/core/xorHash.js';
import {
  textToBytes,
  bytesToHex,
  bytesToBinaryString,
  hexToBytes,
  xorBytes,
  rotateLeft1,
  hammingDistance,
  flipBit,
} from '../js/core/bitUtils.js';

/* ------------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------------ */

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

const hex = (bytes) => bytesToHex(bytes);

/** Index (0 = leftmost) of the single set bit in a byte array. */
function onlySetBitIndex(bytes) {
  const positions = [];
  bytes.forEach((byte, i) => {
    for (let b = 0; b < 8; b++) {
      if (byte & (0x80 >> b)) positions.push(i * 8 + b);
    }
  });
  assert.equal(positions.length, 1, 'expected exactly one set bit');
  return positions[0];
}

/* ------------------------------------------------------------------------ *
 *  1. Known vectors
 * ------------------------------------------------------------------------ */

describe('rxorHash: known vectors', () => {
  test('"HI" with 1-byte blocks = 11011001 (0xD9)', () => {
    const hash = rxorHash(textToBytes('HI'), 1);
    assert.equal(bytesToBinaryString(hash), '11011001');
    assert.equal(hex(hash), 'd9');
  });

  test('plain XOR of the same message gives 0x01, so RXOR is different', () => {
    assert.equal(hex(xorHash(textToBytes('HI'), 1)), '01');
    assert.notEqual(
      hex(rxorHash(textToBytes('HI'), 1)),
      hex(xorHash(textToBytes('HI'), 1)),
    );
  });

  test('"IH" = 0xDA, so order matters', () => {
    // h = 0x49; ROL1(0x49) = 0x92; 0x92 ^ 0x48 = 0xDA
    assert.equal(hex(rxorHash(textToBytes('IH'), 1)), 'da');
  });

  test('"ABC" with 1-byte blocks = 0xC2', () => {
    // 0x41 -> ROL1 0x82 ^ 0x42 = 0xC0 -> ROL1 0x81 ^ 0x43 = 0xC2
    assert.equal(hex(rxorHash(textToBytes('ABC'), 1)), 'c2');
  });

  test('rotation covers the WHOLE block: 0x8000 then 0x0000 = 0x0001', () => {
    const msg = hexToBytes('80 00 00 00');
    assert.equal(hex(rxorHash(msg, 2)), '0001');
  });

  test('a single block: RXOR equals XOR', () => {
    const rng = mulberry32(11);
    for (const blockBytes of [1, 2, 4, 8, 16]) {
      const msg = randomBytes(rng, blockBytes);
      assertBytesEqual(rxorHash(msg, blockBytes), xorHash(msg, blockBytes));
    }
  });

  test('default block size is 2 bytes', () => {
    const hash = rxorHash(textToBytes('HI'));
    assert.equal(hash.length, 2);
    assert.equal(hex(hash), '4849');
  });

  test('empty message gives an all-zero hash of blockBytes length', () => {
    for (const blockBytes of [1, 2, 4, 16]) {
      const hash = rxorHash(new Uint8Array(0), blockBytes);
      assert.equal(hash.length, blockBytes);
      assert.ok(hash.every((b) => b === 0));
    }
  });

  test('"ABC" with 2-byte blocks: zero-padded, ROL1(0x4142) ^ 0x4300', () => {
    // ROL1(0x4142) = 0x8284; 0x8284 ^ 0x4300 = 0xC184
    assert.equal(hex(rxorHash(textToBytes('ABC'), 2)), 'c184');
  });

  test('appendLength = true matches a manual calculation', () => {
    // "HI", 2-byte blocks: 4849, 0000, 0000, 0000, 0010
    let h = new Uint8Array(2);
    for (const block of [[0x48, 0x49], [0, 0], [0, 0], [0, 0], [0x00, 0x10]]) {
      h = xorBytes(rotateLeft1(h), Uint8Array.from(block));
    }
    assertBytesEqual(rxorHash(textToBytes('HI'), 2, true), h);
  });
});

/* ------------------------------------------------------------------------ *
 *  2. Order sensitivity
 * ------------------------------------------------------------------------ */

describe('rxorHash: order matters (breaks the XOR swap trick)', () => {
  test('"HI" and "IH" give different hashes', () => {
    assert.notEqual(
      hex(rxorHash(textToBytes('HI'), 1)),
      hex(rxorHash(textToBytes('IH'), 1)),
    );
  });

  test('swapping two different blocks changes the hash in most random cases', () => {
    const rng = mulberry32(12);
    let changed = 0;
    const trials = 100;
    for (let t = 0; t < trials; t++) {
      const blocks = Array.from({ length: 5 }, () => randomBytes(rng, 2));
      const swapped = blocks.slice();
      [swapped[1], swapped[3]] = [swapped[3], swapped[1]];
      const join = (list) => Uint8Array.from(list.flatMap((b) => Array.from(b)));
      if (hex(rxorHash(join(blocks), 2)) !== hex(rxorHash(join(swapped), 2))) {
        changed++;
      }
    }
    assert.ok(changed >= 90, `only ${changed}/${trials} swaps changed the hash`);
  });

  test('the same swap NEVER changes the plain XOR hash (contrast)', () => {
    const rng = mulberry32(13);
    for (let t = 0; t < 50; t++) {
      const blocks = Array.from({ length: 5 }, () => randomBytes(rng, 2));
      const swapped = blocks.slice();
      [swapped[1], swapped[3]] = [swapped[3], swapped[1]];
      const join = (list) => Uint8Array.from(list.flatMap((b) => Array.from(b)));
      assertBytesEqual(xorHash(join(blocks), 2), xorHash(join(swapped), 2));
    }
  });
});

/* ------------------------------------------------------------------------ *
 *  3. What is still weak
 * ------------------------------------------------------------------------ */

describe('rxorHash: still linear and still no avalanche', () => {
  test('linearity: hash(A) ^ hash(B) = hash(A ^ B) for equal-length data', () => {
    const rng = mulberry32(14);
    for (const blockBytes of [1, 2, 4, 16]) {
      for (let trial = 0; trial < 20; trial++) {
        const a = randomBytes(rng, blockBytes * 4);
        const b = randomBytes(rng, blockBytes * 4);
        assertBytesEqual(
          xorBytes(rxorHash(a, blockBytes), rxorHash(b, blockBytes)),
          rxorHash(xorBytes(a, b), blockBytes),
        );
      }
    }
  });

  test('flipping ANY single input bit changes EXACTLY one output bit', () => {
    const msg = textToBytes('Pay Alice 100'); // 13 bytes
    const before = rxorHash(msg, 2);
    for (let bit = 0; bit < msg.length * 8; bit++) {
      const after = rxorHash(flipBit(msg, bit), 2);
      assert.equal(hammingDistance(before, after), 1, `bit ${bit}`);
    }
  });

  test('the changed bit is only MOVED: position = (p - (m-1-j)) mod n', () => {
    const blockBytes = 2;
    const n = blockBytes * 8; // 16-bit hash
    const blocks = 6;
    const msg = new Uint8Array(blocks * blockBytes); // all zeros, aligned
    const before = rxorHash(msg, blockBytes);

    for (let j = 0; j < blocks; j++) {
      for (let p = 0; p < n; p++) {
        const flipped = flipBit(msg, j * n + p);
        const diff = xorBytes(before, rxorHash(flipped, blockBytes));
        const expected = (((p - (blocks - 1 - j)) % n) + n) % n;
        assert.equal(onlySetBitIndex(diff), expected, `block ${j}, bit ${p}`);
      }
    }
  });
});

/* ------------------------------------------------------------------------ *
 *  4. rxorHashSteps
 * ------------------------------------------------------------------------ */

describe('rxorHashSteps', () => {
  test('"HI" with 1-byte blocks, step by step', () => {
    const run = rxorHashSteps(textToBytes('HI'), 1);
    assert.equal(run.blocks.length, 2);
    assert.equal(run.steps.length, 2);

    assert.equal(hex(run.steps[0].previous), '00');
    assert.equal(hex(run.steps[0].rotated), '00');
    assert.equal(hex(run.steps[0].block), '48');
    assert.equal(hex(run.steps[0].result), '48');

    assert.equal(hex(run.steps[1].previous), '48');
    assert.equal(hex(run.steps[1].rotated), '90');
    assert.equal(hex(run.steps[1].block), '49');
    assert.equal(hex(run.steps[1].result), 'd9');

    assert.equal(hex(run.hash), 'd9');
  });

  test('every step: rotated = ROL1(previous), result = rotated ^ block', () => {
    const rng = mulberry32(15);
    const msg = randomBytes(rng, 37);
    const run = rxorHashSteps(msg, 4);

    assert.ok(run.steps[0].previous.every((b) => b === 0), 'starts from zeros');
    run.steps.forEach((step, i) => {
      assert.equal(step.index, i);
      assertBytesEqual(step.rotated, rotateLeft1(step.previous));
      assertBytesEqual(step.result, xorBytes(step.rotated, step.block));
      assertBytesEqual(step.block, run.blocks[i]);
      if (i > 0) assertBytesEqual(step.previous, run.steps[i - 1].result);
    });
    assertBytesEqual(run.steps[run.steps.length - 1].result, run.hash);
  });

  test('hash from rxorHashSteps equals hash from rxorHash', () => {
    const rng = mulberry32(16);
    for (const blockBytes of [1, 2, 4, 8, 16]) {
      const msg = randomBytes(rng, 50);
      assertBytesEqual(rxorHashSteps(msg, blockBytes).hash, rxorHash(msg, blockBytes));
    }
  });

  test('empty message: no blocks, no steps, zero hash', () => {
    const run = rxorHashSteps(new Uint8Array(0), 2);
    assert.equal(run.blocks.length, 0);
    assert.equal(run.steps.length, 0);
    assertBytesEqual(run.hash, [0, 0]);
  });
});

/* ------------------------------------------------------------------------ *
 *  5. Safety
 * ------------------------------------------------------------------------ */

describe('rxorHash: does not modify its input', () => {
  test('rxorHash and rxorHashSteps leave the message untouched', () => {
    const input = hexToBytes('48 49 4a 4b 4c');
    const copy = Uint8Array.from(input);
    rxorHash(input, 2);
    rxorHashSteps(input, 2);
    assertBytesEqual(input, copy);
  });
});