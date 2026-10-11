/**
 * ============================================================================
 *  File    : js/core/config.js
 *  Project : Hash Forge  
 *  Module  : Shared constants (one place to change project-wide settings)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Holds every shared constant in ONE place so the same number is never
 *  hard-coded in several files. It contains only data and two tiny helper
 *  functions (no DOM, no hashing). All exported objects and arrays are frozen
 *  so no other file can change them by accident.
 *
 *  WHAT I DEFINED (exported)
 *  -------------------------
 *  Block / hash sizes
 *    DEFAULT_BLOCK_BITS      16   demo block size, so hashes are short enough
 *                                 to read and verify by hand on screen
 *    DEFAULT_BLOCK_BYTES     2    the same value in bytes (16 / 8)
 *    ALLOWED_BLOCK_BITS      [8, 16, 32, 64, 128]   sizes the user can pick
 *    ALLOWED_BLOCK_BYTES     [1, 2, 4, 8, 16]       the same sizes in bytes
 *    SHA256_BITS             256  full SHA-256 output size
 *
 *  Text
 *    TEXT_ENCODING           'utf-8'  (identical to ASCII for normal text)
 *
 *  Analyzer (Slide 3)
 *    ANALYZER_HASH_BITS      128  hash size used for the 112-of-128 example
 *    ANALYZER_MAX_ROWS       256  max bytes drawn in the heatmap
 *
 *  Collision and avalanche lab (Slides 7 and 9)
 *    BIRTHDAY_SHA_BITS       [8, 16, 24, 32]  truncated SHA-256 sizes
 *    AVALANCHE_TRIALS        100  random bit flips averaged for the chart
 *
 *  Animation (visualizer)
 *    ANIMATION_SPEEDS        { slow: 1200, normal: 700, fast: 300 } (ms/step)
 *    DEFAULT_ANIMATION_SPEED 'normal'
 *
 *  Helpers
 *    blockBitsToBytes(bits)  16 -> 2; throws if the size is not allowed
 *    getStepDelay(speed)     'fast' -> 300; unknown names fall back to normal
 *
 *  NOTE ON EXISTING FILES
 *  ----------------------
 *  avalanche.js and collision.js currently keep their own local copies of
 *  DEFAULT_BLOCK_BYTES (2) and the allowed SHA sizes, so they work without
 *  this file. To use this file instead, replace the local constants with:
 *    import { DEFAULT_BLOCK_BYTES, BIRTHDAY_SHA_BITS } from '../core/config.js';
 *
 *  USED BY : js/main.js, js/ui/* views, js/ui/components/*
 *  DEPENDS : nothing (standalone module)
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Block / hash sizes
// ---------------------------------------------------------------------------

/** Demo block size in bits (short, so hashes can be checked by hand). */
export const DEFAULT_BLOCK_BITS = 16;

/** Demo block size in bytes. */
export const DEFAULT_BLOCK_BYTES = DEFAULT_BLOCK_BITS / 8;

/** Block sizes (in bits) the user may choose in the UI. */
export const ALLOWED_BLOCK_BITS = Object.freeze([8, 16, 32, 64, 128]);

/** The same allowed sizes in bytes. */
export const ALLOWED_BLOCK_BYTES = Object.freeze(ALLOWED_BLOCK_BITS.map((bits) => bits / 8));

/** Full SHA-256 output size in bits. */
export const SHA256_BITS = 256;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Encoding used to turn text into bytes (same as ASCII for plain English). */
export const TEXT_ENCODING = 'utf-8';

// ---------------------------------------------------------------------------
// Predictable-Data Analyzer (Slide 3)
// ---------------------------------------------------------------------------

/** Hash size used for the textbook example: 128 bits, 16 bytes, 112 effective. */
export const ANALYZER_HASH_BITS = 128;

/** Maximum number of bytes drawn in the heatmap (keeps the page fast). */
export const ANALYZER_MAX_ROWS = 256;

// ---------------------------------------------------------------------------
// Collision and Avalanche Lab (Slides 7 and 9)
// ---------------------------------------------------------------------------

/** Truncated SHA-256 sizes for the birthday-attack demo. */
export const BIRTHDAY_SHA_BITS = Object.freeze([8, 16, 24, 32]);

/** Number of random single-bit flips averaged in the avalanche chart. */
export const AVALANCHE_TRIALS = 100;

// ---------------------------------------------------------------------------
// Animation (Hash Visualizer)
// ---------------------------------------------------------------------------

/** Delay per animation step in milliseconds. */
export const ANIMATION_SPEEDS = Object.freeze({
  slow: 1200,
  normal: 700,
  fast: 300,
});

/** Speed selected when the app starts. */
export const DEFAULT_ANIMATION_SPEED = 'normal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an allowed block size from bits to bytes.
 * @param {number} bits  One of ALLOWED_BLOCK_BITS
 * @returns {number} bytes, e.g. 16 -> 2
 * @throws {Error} if the size is not allowed
 */
export function blockBitsToBytes(bits) {
  if (!ALLOWED_BLOCK_BITS.includes(bits)) {
    throw new Error(`Block size must be one of: ${ALLOWED_BLOCK_BITS.join(', ')} bits`);
  }
  return bits / 8;
}

/**
 * Get the per-step animation delay in milliseconds.
 * @param {string} speed  'slow' | 'normal' | 'fast' (unknown falls back to normal)
 * @returns {number}
 */
export function getStepDelay(speed) {
  return ANIMATION_SPEEDS[speed] ?? ANIMATION_SPEEDS[DEFAULT_ANIMATION_SPEED];
}