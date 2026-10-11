/**
 * ============================================================================
 *  File    : tests/bitAnalyzer.test.js
 *  Project : Hash Forge
 *  Module  : Unit tests for js/analysis/bitAnalyzer.js (Slide 3: 2^-112 vs 2^-128)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Automated tests for the Predictable-Data Analyzer logic, using Node's
 *  built-in test runner (no libraries).  Run with:   npm test
 *  (which runs "node --test tests/"), or just this file:
 *      node --test tests/bitAnalyzer.test.js
 *
 *  WHAT I TESTED
 *  -------------
 *  1. bitPositionFrequency
 *       - ASCII text has bit 7 frequency of exactly 0 (the key claim).
 *       - Hand-made bytes give exact, known frequencies (bit 0, bit 7).
 *       - All 256 byte values once each give 0.5 for every bit position.
 *       - Non-ASCII text (the Rupee sign) breaks the "bit 7 is 0" pattern,
 *         so the claim is about ASCII only.
 *       - Empty input gives NaN (never a fake "fixed" result).
 *       - The input array is not modified.
 *  2. fixedBitPositions
 *       - ASCII text: bit 7 is reported as fixed at 0.
 *       - All 256 byte values: nothing is fixed (random-like contrast case).
 *       - Constant 0xFF bytes: all 8 positions are fixed at 1.
 *       - Empty input (NaN frequencies): nothing is reported as fixed.
 *  3. effectiveHashBits
 *       - THE SLIDE 3 RESULT: 128-bit hash, 1 fixed bit per byte -> 112
 *         effective bits, probability exponent -112 (versus -128).
 *       - Other sizes (0, 2 fixed bits per byte, 64-bit hash).
 *       - Invalid input throws: hashBits not a positive multiple of 8,
 *         fixedPerByte not an integer from 0 to 8.
 *  4. byteHeatmapData
 *       - One row per byte, 8 columns, leftmost column = bit 7.
 *       - The maxRows limit works; empty input gives no rows.
 *       - For ASCII text the whole first column (bit 7) is 0.
 *  5. analyzeBytes
 *       - Empty input returns empty: true.
 *       - ASCII text analysed as a 128-bit hash reports 112 effective bits.
 *  6. Integration with the real XOR hash
 *       - XOR hash of ASCII text with 16-byte blocks (128-bit hash) has
 *         bit 7 equal to 0 in every one of its 16 bytes. This is the actual
 *         reason for "112 of 128", shown with the real hash function.
 *
 *  ASSUMPTIONS ABOUT bitAnalyzer.js (please check)
 *  -----------------------------------------------
 *  I wrote this against the header comment, not the code. Where the header
 *  did not give an exact return shape, the tests are written to be tolerant
 *  and the guesses are gathered in the helpers right below the imports:
 *    - fixedBitPositions() returns either an array of numbers or an array of
 *      objects with the position under position / bit / index and the fixed
 *      value under value / fixedValue / fixedTo (or the array may be under
 *      the keys positions / fixed). Fixed VALUES are only checked if present.
 *    - effectiveHashBits() and analyzeBytes() may return a number or an
 *      object; I search every numeric field (even nested) for 112 and -112
 *      instead of guessing field names.
 *    - byteHeatmapData() returns an array of rows, each row an array of 8
 *      numbers (0 or 1), leftmost = bit 7.
 *    - Empty input gives NaN frequencies (as the header says).
 *  If a test fails with one of these shapes, fix the helper, not the test.
 *
 *  ALSO NEEDED
 *  -----------
 *  package.json must contain  "type": "module"  so Node treats these
 *  .js files as ES modules (the project already uses import/export).
 *
 *  DEPENDS : js/analysis/bitAnalyzer.js, js/core/bitUtils.js,
 *            js/core/xorHash.js, node:test, node:assert
 * ============================================================================
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bitPositionFrequency,
  fixedBitPositions,
  effectiveHashBits,
  byteHeatmapData,
  analyzeBytes,
} from '../js/analysis/bitAnalyzer.js';
import { textToBytes } from '../js/core/bitUtils.js';
import { xorHash } from '../js/core/xorHash.js';

/* ------------------------------------------------------------------------ *
 *  Test data and helpers
 * ------------------------------------------------------------------------ */

const ENGLISH =
  'The quick brown fox jumps over the lazy dog. Hash functions turn any ' +
  'message into a short fixed-size fingerprint, 0123456789!';

/** All 256 possible byte values once each (random-like: every bit is 50/50). */
const ALL_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);

/** True if any number anywhere inside `value` (nested too) equals `target`. */
function containsNumber(value, target) {
  if (typeof value === 'number') return value === target;
  if (value && typeof value === 'object') {
    return Object.values(value).some((v) => containsNumber(v, target));
  }
  return false;
}

/** Turns the result of fixedBitPositions() into [{ position, value }]. */
function fixedList(result) {
  const list = Array.isArray(result) ? result : (result.positions ?? result.fixed ?? []);
  return list.map((item) =>
    typeof item === 'number'
      ? { position: item, value: undefined }
      : {
          position: item.position ?? item.bit ?? item.index,
          value: item.value ?? item.fixedValue ?? item.fixedTo,
        },
  );
}

/** Only the bit positions reported as fixed, sorted. */
function fixedPositionNumbers(result) {
  return fixedList(result)
    .map((e) => e.position)
    .sort((a, b) => a - b);
}

/** The array of rows, whether byteHeatmapData returns an array or an object. */
function rowsOf(result) {
  if (Array.isArray(result)) return result;
  for (const key of ['rows', 'matrix', 'data', 'cells', 'heatmap']) {
    if (Array.isArray(result?.[key])) return result[key];
  }
  return Object.values(result ?? {}).find(Array.isArray) ?? [];
}

/** The 8 bits of one row, whether the row is an array or an object. */
function rowBits(row) {
  if (Array.isArray(row) || ArrayBuffer.isView(row)) return Array.from(row);
  return Array.from(row.bits ?? row.cells ?? row.values ?? []);
}

/** Numbers stored under keys whose name matches `pattern` (nested too). */
function numbersAtKeys(value, pattern, found = []) {
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'number' && pattern.test(key)) found.push(v);
      else numbersAtKeys(v, pattern, found);
    }
  }
  return found;
}

/* ------------------------------------------------------------------------ *
 *  1. bitPositionFrequency
 * ------------------------------------------------------------------------ */

describe('bitPositionFrequency', () => {
  test('ASCII text has bit 7 frequency of exactly 0', () => {
    const freq = bitPositionFrequency(textToBytes(ENGLISH));
    assert.equal(freq.length, 8);
    assert.equal(freq[7], 0);
  });

  test('other bit positions of English text are NOT all zero', () => {
    const freq = bitPositionFrequency(textToBytes(ENGLISH));
    for (let bit = 0; bit <= 6; bit++) {
      assert.ok(freq[bit] > 0, `bit ${bit} should be 1 in at least one byte`);
    }
  });

  test('known bytes give exact frequencies (bit 0 = rightmost bit)', () => {
    // 00000001, 00000001, 00000000, 00000000 -> bit 0 is 1 in half the bytes
    const freq = bitPositionFrequency(Uint8Array.from([1, 1, 0, 0]));
    assert.equal(freq[0], 0.5);
    for (let bit = 1; bit <= 7; bit++) assert.equal(freq[bit], 0);
  });

  test('bit 7 is the leftmost (highest-order) bit', () => {
    // 10000000 -> only bit 7 is set
    const freq = bitPositionFrequency(Uint8Array.from([0b10000000]));
    assert.equal(freq[7], 1);
    for (let bit = 0; bit <= 6; bit++) assert.equal(freq[bit], 0);
  });

  test('all 256 byte values give 0.5 for every bit position', () => {
    const freq = bitPositionFrequency(ALL_BYTES);
    for (let bit = 0; bit < 8; bit++) assert.equal(freq[bit], 0.5);
  });

  test('non-ASCII text (Rupee sign) makes bit 7 non-zero', () => {
    const freq = bitPositionFrequency(textToBytes('Pay \u20B9100'));
    assert.ok(freq[7] > 0, 'UTF-8 bytes of the Rupee sign have bit 7 = 1');
  });

  test('empty input gives NaN, never a fake "fixed" value', () => {
    const freq = bitPositionFrequency(new Uint8Array(0));
    assert.equal(freq.length, 8);
    assert.ok(freq.every((f) => Number.isNaN(f)));
  });

  test('does not modify the input array', () => {
    const input = Uint8Array.from([72, 73, 200, 0]);
    const copy = Uint8Array.from(input);
    bitPositionFrequency(input);
    assert.deepEqual(input, copy);
  });
});

/* ------------------------------------------------------------------------ *
 *  2. fixedBitPositions
 * ------------------------------------------------------------------------ */

describe('fixedBitPositions', () => {
  test('ASCII text: bit 7 is reported as fixed at 0', () => {
    const freq = bitPositionFrequency(textToBytes(ENGLISH));
    const list = fixedList(fixedBitPositions(freq, 0.01));
    const bit7 = list.find((e) => e.position === 7);
    assert.ok(bit7, 'bit 7 should be in the fixed list');
    if (bit7.value !== undefined) assert.equal(bit7.value, 0);
  });

  test('random-like data (all 256 byte values): no fixed bits', () => {
    const freq = bitPositionFrequency(ALL_BYTES);
    assert.deepEqual(fixedPositionNumbers(fixedBitPositions(freq, 0.01)), []);
  });

  test('constant 0xFF bytes: all 8 positions fixed at 1', () => {
    const freq = bitPositionFrequency(Uint8Array.from([255, 255, 255, 255]));
    const list = fixedList(fixedBitPositions(freq, 0.01));
    assert.deepEqual(
      list.map((e) => e.position).sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
    for (const e of list) {
      if (e.value !== undefined) assert.equal(e.value, 1);
    }
  });

  test('empty input (NaN frequencies): nothing is reported as fixed', () => {
    const freq = bitPositionFrequency(new Uint8Array(0));
    assert.deepEqual(fixedPositionNumbers(fixedBitPositions(freq, 0.01)), []);
  });
});

/* ------------------------------------------------------------------------ *
 *  3. effectiveHashBits  (the Slide 3 result)
 * ------------------------------------------------------------------------ */

describe('effectiveHashBits', () => {
  test('128-bit hash with 1 fixed bit per byte -> 112 effective bits', () => {
    const result = effectiveHashBits(128, 1);
    assert.ok(containsNumber(result, 112), 'result should contain 112');
  });

  test('probability exponent is -112 (versus -128 for random data)', () => {
    const result = effectiveHashBits(128, 1);
    assert.ok(containsNumber(result, -112), 'result should contain -112');
  });

  test('no fixed bits -> all 128 bits are effective', () => {
    assert.ok(containsNumber(effectiveHashBits(128, 0), 128));
  });

  test('2 fixed bits per byte -> 128 - 16*2 = 96 effective bits', () => {
    assert.ok(containsNumber(effectiveHashBits(128, 2), 96));
  });

  test('64-bit hash (8 bytes) with 1 fixed bit per byte -> 56', () => {
    assert.ok(containsNumber(effectiveHashBits(64, 1), 56));
  });

  test('hashBits must be a positive multiple of 8', () => {
    assert.throws(() => effectiveHashBits(0, 1));
    assert.throws(() => effectiveHashBits(100, 1));
    assert.throws(() => effectiveHashBits(-8, 1));
  });

  test('fixedPerByte must be an integer from 0 to 8', () => {
    assert.throws(() => effectiveHashBits(128, -1));
    assert.throws(() => effectiveHashBits(128, 9));
    assert.throws(() => effectiveHashBits(128, 1.5));
  });
});

/* ------------------------------------------------------------------------ *
 *  4. byteHeatmapData
 * ------------------------------------------------------------------------ */

describe('byteHeatmapData', () => {
  test('one row per byte, 8 columns, leftmost column = bit 7', () => {
    const rows = rowsOf(byteHeatmapData(Uint8Array.from([0b10110000, 0b00000001])));
    assert.equal(rows.length, 2);
    assert.deepEqual(rowBits(rows[0]), [1, 0, 1, 1, 0, 0, 0, 0]);
    assert.deepEqual(rowBits(rows[1]), [0, 0, 0, 0, 0, 0, 0, 1]);
  });

  test('ASCII text: the whole first column (bit 7) is 0', () => {
    const rows = rowsOf(byteHeatmapData(textToBytes(ENGLISH)));
    assert.ok(rows.length > 0);
    for (const row of rows) assert.equal(rowBits(row)[0], 0);
  });

  test('maxRows limits the number of rows', () => {
    const data = new Uint8Array(300).fill(65);
    assert.equal(rowsOf(byteHeatmapData(data, 5)).length, 5);
    assert.equal(rowsOf(byteHeatmapData(data, 256)).length, 256);
  });

  test('empty input gives no rows', () => {
    assert.equal(rowsOf(byteHeatmapData(new Uint8Array(0))).length, 0);
  });

  test('does not modify the input array', () => {
    const input = Uint8Array.from([1, 2, 3]);
    const copy = Uint8Array.from(input);
    byteHeatmapData(input);
    assert.deepEqual(input, copy);
  });
});

/* ------------------------------------------------------------------------ *
 *  5. analyzeBytes (convenience wrapper used by analyzerView.js)
 * ------------------------------------------------------------------------ */

describe('analyzeBytes', () => {
  test('empty input returns an empty: true result', () => {
    const result = analyzeBytes(new Uint8Array(0), 128);
    assert.equal(result.empty, true);
  });

  test('ASCII text analysed as a 128-bit hash reports 112 effective bits', () => {
    const result = analyzeBytes(textToBytes(ENGLISH), 128);
    assert.notEqual(result.empty, true);
    assert.ok(containsNumber(result, 112), 'result should contain 112');
  });

  test('random-like data (all 256 byte values) keeps all 128 bits', () => {
    const result = analyzeBytes(ALL_BYTES, 128);
    const effective = numbersAtKeys(result, /effective/i);
    if (effective.length > 0) {
      assert.ok(effective.includes(128), `effective bits: ${effective}`);
      assert.ok(!effective.includes(112));
    } else {
      assert.ok(containsNumber(result, 128));
    }
  });
});

/* ------------------------------------------------------------------------ *
 *  6. Integration: the real XOR hash of ASCII text
 * ------------------------------------------------------------------------ */

describe('XOR hash of ASCII text (why it is 112 of 128 bits)', () => {
  test('128-bit XOR hash: bit 7 is 0 in every one of the 16 bytes', () => {
    const hash = xorHash(textToBytes(ENGLISH), 16);
    assert.equal(hash.length, 16);
    for (const byte of hash) {
      assert.equal(byte & 0x80, 0, 'highest-order bit must be 0');
    }
  });

  test('the hash bytes themselves are not all zero (the other 112 bits vary)', () => {
    const hash = xorHash(textToBytes(ENGLISH), 16);
    assert.ok(hash.some((b) => b !== 0));
  });
});