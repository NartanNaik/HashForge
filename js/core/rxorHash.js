/**
 * ============================================================================
 *  File    : js/core/rxorHash.js
 *  Project : Hash Forge
 *  Module  : Rotated XOR (RXOR) hash function (Slides 8 and 9)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure logic (no DOM). Implements the Rotated XOR hash exactly as written on
 *  Slide 8:
 *
 *      Initialize hash value to zero
 *      For each input block:
 *          Rotate hash value left by one bit
 *          XOR the input block with the hash value
 *      Return the final hash value
 *
 *  In maths:   h = 0;   for each block Bi:   h = ROL1(h) ^ Bi
 *
 *  ROL1 is a ONE-bit CIRCULAR left rotation of the whole n-bit hash value
 *  (the leftmost bit wraps around to the rightmost position).
 *
 *  Unlike plain XOR, the order of blocks now matters, so the "swap two blocks"
 *  trick no longer works. It is still weak, though: the forgery attack in
 *  attacks/forgery.js works on it, and flipping one input bit changes exactly
 *  one output bit (see attacks/avalanche.js).
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. rxorHash(bytes, blockBytes, appendLength)
 *       Returns the final hash as a Uint8Array of blockBytes bytes.
 *       The message is first padded and split into blocks (see padding.js).
 *
 *  2. rxorHashSteps(bytes, blockBytes, appendLength)
 *       Same calculation, but records EVERY step so the visualizer can
 *       animate it. Returns:
 *         {
 *           blocks : Uint8Array[]    the padded input blocks
 *           steps  : [{
 *             index     : number     0-based block number
 *             block     : Uint8Array the input block Bi
 *             previous  : Uint8Array hash value before this step
 *             rotated   : Uint8Array ROL1(previous)
 *             result    : Uint8Array rotated ^ block (the new hash value)
 *           }]
 *           hash   : Uint8Array      the final hash (zeros if no blocks)
 *         }
 *
 *  WORKED EXAMPLE (block size 1 byte, message "HI" = 01001000 01001001)
 *  --------------------------------------------------------------------
 *    start         h = 00000000
 *    block 1       ROL1(00000000) = 00000000   ^ 01001000 = 01001000
 *    block 2       ROL1(01001000) = 10010000   ^ 01001001 = 11011001  (0xD9)
 *    RXOR("HI") = 11011001      (plain XOR gives 00000001)
 *    RXOR("IH") = 11011010      (different, so ORDER MATTERS)
 *
 *  DEFAULTS
 *  --------
 *  - blockBytes defaults to DEFAULT_BLOCK_BYTES from config.js (2 bytes).
 *  - appendLength defaults to false (plain zero padding, no length block).
 *    forgery.js and collision.js assume this default.
 *  - An empty message has no blocks, so its hash is all zeros.
 *
 *  USED BY : js/attacks/forgery.js, js/attacks/collision.js,
 *            js/attacks/avalanche.js, js/ui/visualizerView.js,
 *            tests/rxorHash.test.js
 *  DEPENDS : core/bitUtils.js, core/padding.js, core/config.js
 * ============================================================================
 */

import { xorBytes, rotateLeft1 } from './bitUtils.js';
import { splitIntoBlocks } from './padding.js';
import { DEFAULT_BLOCK_BYTES } from './config.js';

/**
 * Compute the RXOR hash and record every intermediate step.
 *
 * @param {Uint8Array|number[]} bytes   Message
 * @param {number} blockBytes           Block size in bytes (default 2)
 * @param {boolean} appendLength        Append length field when padding (default false)
 * @returns {{ blocks:Uint8Array[], steps:object[], hash:Uint8Array }}
 */
export function rxorHashSteps(bytes, blockBytes = DEFAULT_BLOCK_BYTES, appendLength = false) {
  const blocks = splitIntoBlocks(bytes, blockBytes, appendLength);

  let hash = new Uint8Array(blockBytes); // Step 1: initialise to zero
  const steps = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const previous = hash;
    const rotated = rotateLeft1(previous); // Step 3: rotate left by one bit
    const result = xorBytes(rotated, block); // Step 4: XOR with the input block

    steps.push({ index, block, previous, rotated, result });
    hash = result;
  }

  return { blocks, steps, hash };
}

/**
 * Compute the RXOR hash of a message.
 *
 * @param {Uint8Array|number[]} bytes   Message
 * @param {number} blockBytes           Block size in bytes (default 2)
 * @param {boolean} appendLength        Append length field when padding (default false)
 * @returns {Uint8Array} hash of blockBytes bytes
 */
export function rxorHash(bytes, blockBytes = DEFAULT_BLOCK_BYTES, appendLength = false) {
  return rxorHashSteps(bytes, blockBytes, appendLength).hash;
}