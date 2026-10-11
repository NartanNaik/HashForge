/**
 * ============================================================================
 *  File    : js/core/bitUtils.js
 *  Project : Hash Forge
 *  Module  : Low-level byte and bit helpers (the foundation of the project)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure helper functions (no DOM) used by almost every other file: converting
 *  text to bytes, bytes to binary / hex strings, XOR of byte arrays, the
 *  circular left rotation used by RXOR, and bit counting / flipping.
 *
 *  All functions treat data as arrays of BYTES (Uint8Array). Plain number
 *  arrays are accepted as input and always converted. Functions NEVER modify
 *  the arrays you pass in; they return new ones.
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  Conversions
 *    textToBytes(str)                    "HI" -> Uint8Array [72, 73]  (UTF-8,
 *                                        identical to ASCII for normal text)
 *    bytesToBinaryString(bytes, sep)     [72, 73] -> "01001000 01001001"
 *    bytesToHex(bytes)                   [72, 73] -> "4849"
 *    hexToBytes(hex)                     "4849"   -> Uint8Array [72, 73]
 *                                        (spaces and a leading 0x are allowed)
 *
 *  Operations used by the hash functions
 *    xorBytes(a, b)                      bitwise XOR of two equal-length arrays
 *                                        01001000 ^ 01001001 = 00000001
 *    rotateLeft1(bytes)                  circular left rotation by ONE bit over
 *                                        the WHOLE n-bit value (RXOR step).
 *                                        [10000001] -> [00000011]
 *                                        [10000000, 00000001] ->
 *                                        [00000000, 00000011]
 *
 *  Measuring and changing bits
 *    countSetBits(bytes)                 number of 1-bits
 *    hammingDistance(a, b)               number of bit positions that differ
 *    flipBit(bytes, index)               returns a COPY with one bit flipped
 *
 *  BIT NUMBERING CONVENTION (important)
 *  ------------------------------------
 *  flipBit() index 0 is the LEFTMOST bit of the FIRST byte, index 7 is the
 *  rightmost bit of the first byte, index 8 is the leftmost bit of the second
 *  byte, and so on. This matches how binary strings are read on the slides.
 *  (bitAnalyzer.js numbers positions inside a byte the other way round, with
 *  bit 7 = leftmost, because the slides call it the "highest-order bit".)
 *
 *  ERROR HANDLING
 *  --------------
 *  - xorBytes / hammingDistance throw if the two arrays differ in length.
 *  - hexToBytes throws on odd length or non-hex characters.
 *  - flipBit throws if the index is out of range.
 *
 *  USED BY : every file in js/core, js/attacks, js/analysis and js/ui
 *  DEPENDS : nothing (standalone module)
 * ============================================================================
 */

/** Convert any array-like of numbers into a fresh Uint8Array. */
function asBytes(data) {
  if (data === null || data === undefined) {
    throw new Error('Expected a byte array but got ' + data);
  }
  return Uint8Array.from(data);
}

/** Throw if two byte arrays do not have the same length. */
function assertSameLength(a, b, fnName) {
  if (a.length !== b.length) {
    throw new Error(`${fnName}: arrays must have the same length (${a.length} vs ${b.length})`);
  }
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/**
 * Convert text to bytes (UTF-8; same as ASCII for ordinary English text).
 * @param {string} str
 * @returns {Uint8Array}
 */
export function textToBytes(str) {
  return new TextEncoder().encode(String(str));
}

/**
 * Convert bytes to a binary string, one 8-bit group per byte.
 * @param {Uint8Array|number[]} bytes
 * @param {string} separator  Placed between bytes (default a space)
 * @returns {string} e.g. "01001000 01001001"
 */
export function bytesToBinaryString(bytes, separator = ' ') {
  return Array.from(asBytes(bytes), (b) => b.toString(2).padStart(8, '0')).join(separator);
}

/**
 * Convert bytes to a lowercase hex string (no separators).
 * @param {Uint8Array|number[]} bytes
 * @returns {string} e.g. "4849"
 */
export function bytesToHex(bytes) {
  return Array.from(asBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert a hex string to bytes. Spaces and a leading "0x" are ignored.
 * @param {string} hex
 * @returns {Uint8Array}
 * @throws {Error} on odd length or invalid characters
 */
export function hexToBytes(hex) {
  const clean = String(hex).replace(/\s+/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hex string: use only 0-9 and a-f');
  }
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string: length must be even');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Operations used by the hash functions
// ---------------------------------------------------------------------------

/**
 * Bitwise XOR of two byte arrays of the same length.
 * @param {Uint8Array|number[]} a
 * @param {Uint8Array|number[]} b
 * @returns {Uint8Array} new array, a ^ b
 */
export function xorBytes(a, b) {
  assertSameLength(a, b, 'xorBytes');
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

/**
 * Circular left rotation by ONE bit across the whole n-bit value.
 * The leftmost bit of the first byte wraps around to the rightmost bit of
 * the last byte; every other bit moves one place to the left.
 *
 * @param {Uint8Array|number[]} bytes
 * @returns {Uint8Array} new rotated array
 */
export function rotateLeft1(bytes) {
  const n = bytes.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const next = bytes[(i + 1) % n]; // for the last byte this wraps to the first
    out[i] = ((bytes[i] << 1) | (next >> 7)) & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Measuring and changing bits
// ---------------------------------------------------------------------------

/**
 * Count the 1-bits in a byte array.
 * @param {Uint8Array|number[]} bytes
 * @returns {number}
 */
export function countSetBits(bytes) {
  let count = 0;
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i] & 0xff;
    while (b) {
      count += b & 1;
      b >>= 1;
    }
  }
  return count;
}

/**
 * Number of bit positions at which two equal-length arrays differ.
 * @param {Uint8Array|number[]} a
 * @param {Uint8Array|number[]} b
 * @returns {number}
 */
export function hammingDistance(a, b) {
  return countSetBits(xorBytes(a, b));
}

/**
 * Return a COPY of `bytes` with one bit flipped.
 * Index 0 = leftmost bit of the first byte (see header for the convention).
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} index  0 .. bytes.length * 8 - 1
 * @returns {Uint8Array} new array with the bit flipped
 * @throws {Error} if index is out of range
 */
export function flipBit(bytes, index) {
  const totalBits = bytes.length * 8;
  if (!Number.isInteger(index) || index < 0 || index >= totalBits) {
    throw new Error(`flipBit: index must be an integer between 0 and ${totalBits - 1}`);
  }
  const out = asBytes(bytes);
  const byteIndex = index >> 3; // which byte
  const bitInByte = index & 7; // 0 = leftmost bit of that byte
  out[byteIndex] ^= 0x80 >> bitInByte;
  return out;
}