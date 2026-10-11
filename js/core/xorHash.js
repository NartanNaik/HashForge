/**
 * ============================================================================
 *  File    : js/core/xorHash.js
 *  Project : Hash Forge
 *  Module  : Simple XOR hash function (Slides 6 and 7)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure logic (no DOM). Implements the XOR hash exactly as on Slide 6:
 *  the message is split into n-bit blocks, and the hash is the bitwise XOR of
 *  ALL the blocks.
 *
 *      Ci = bi1 ^ bi2 ^ ... ^ bim
 *
 *  where Ci is the i-th bit of the hash, bij is the i-th bit of the j-th
 *  block, and m is the number of blocks. In code: start from all zeros and
 *  XOR each block into the running value.
 *
 *  Why it is weak (Slides 7 and 10):
 *    - XOR is commutative, so swapping blocks never changes the hash
 *      (see attacks/collision.js).
 *    - Appending one correcting block forces ANY hash value
 *      (see attacks/forgery.js).
 *    - Flipping one input bit flips exactly one output bit
 *      (see attacks/avalanche.js).
 *    - Predictable text wastes bits: ASCII always has bit 7 = 0
 *      (see analysis/bitAnalyzer.js).
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. xorHash(bytes, blockBytes, appendLength)
 *       Returns the final hash as a Uint8Array of blockBytes bytes.
 *       The message is first padded and split into blocks (see padding.js).
 *
 *  2. xorHashSteps(bytes, blockBytes, appendLength)
 *       Same calculation, but records EVERY step so the visualizer can
 *       animate it. Returns:
 *         {
 *           blocks : Uint8Array[]    the padded input blocks
 *           steps  : [{
 *             index    : number      0-based block number
 *             block    : Uint8Array  the input block Bj
 *             previous : Uint8Array  running hash before this step
 *             result   : Uint8Array  previous ^ block (the new running hash)
 *           }]
 *           hash   : Uint8Array      the final hash (zeros if no blocks)
 *         }
 *
 *  WORKED EXAMPLE (block size 1 byte, message "HI" = 01001000 01001001)
 *  --------------------------------------------------------------------
 *    start        h = 00000000
 *    block 1      00000000 ^ 01001000 = 01001000
 *    block 2      01001000 ^ 01001001 = 00000001      (the Slide 3 example)
 *    XOR("HI") = 00000001
 *    XOR("IH") = 00000001   (same hash: ORDER DOES NOT MATTER)
 *  With 2-byte blocks, "HI" is a single block, so its XOR hash is 0x4849.
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
 *            tests/xorHash.test.js
 *  DEPENDS : core/bitUtils.js, core/padding.js, core/config.js
 * ============================================================================
 */

import { xorBytes } from './bitUtils.js';
import { splitIntoBlocks } from './padding.js';
import { DEFAULT_BLOCK_BYTES } from './config.js';

/**
 * Compute the XOR hash and record every intermediate step.
 *
 * @param {Uint8Array|number[]} bytes   Message
 * @param {number} blockBytes           Block size in bytes (default 2)
 * @param {boolean} appendLength        Append length field when padding (default false)
 * @returns {{ blocks:Uint8Array[], steps:object[], hash:Uint8Array }}
 */
export function xorHashSteps(bytes, blockBytes = DEFAULT_BLOCK_BYTES, appendLength = false) {
  const blocks = splitIntoBlocks(bytes, blockBytes, appendLength);

  let hash = new Uint8Array(blockBytes); // start from all zeros
  const steps = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const previous = hash;
    const result = xorBytes(previous, block); // XOR the block into the running value

    steps.push({ index, block, previous, result });
    hash = result;
  }

  return { blocks, steps, hash };
}

/**
 * Compute the XOR hash of a message.
 *
 * @param {Uint8Array|number[]} bytes   Message
 * @param {number} blockBytes           Block size in bytes (default 2)
 * @param {boolean} appendLength        Append length field when padding (default false)
 * @returns {Uint8Array} hash of blockBytes bytes
 */
export function xorHash(bytes, blockBytes = DEFAULT_BLOCK_BYTES, appendLength = false) {
  return xorHashSteps(bytes, blockBytes, appendLength).hash;
}