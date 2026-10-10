/**
 * ============================================================================
 *  File    : js/core/padding.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Message padding and block splitting (Slide 2)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure logic (no DOM). A hash function works on fixed-size blocks, but a
 *  message can be any length. This file prepares a message for hashing exactly
 *  as Slide 2 describes:
 *
 *      | M (original message) | padding bits | length of M (in bits) |
 *
 *    1. The message is padded so its length is a multiple of the block size.
 *    2. OPTIONALLY the original message length (in bits) is appended in
 *       whole blocks. This is the "length field" from the slide. It makes it
 *       harder for an attacker to build an alternative message with the same
 *       hash, and it stops "M" and "M + trailing zeros" looking identical.
 *    3. The padded message is cut into blocks.
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. paddingNeeded(length, blockBytes)
 *       Zero bytes needed to reach the next block boundary (0 if aligned).
 *
 *  2. lengthFieldSize(blockBytes)
 *       Size in bytes of the length field: at least 8 bytes (64-bit length),
 *       rounded up to a whole number of blocks. 2-byte blocks -> 8 bytes,
 *       16-byte blocks -> 16 bytes.
 *
 *  3. padToBlockSize(bytes, blockBytes, appendLength = false)
 *       Returns the padded message as a new Uint8Array.
 *         appendLength = false : zero-pad only            (the DEFAULT)
 *         appendLength = true  : zero-pad, then append the original length
 *                                in bits, big-endian, in a length field
 *
 *  4. splitIntoBlocks(bytes, blockBytes, appendLength = false)
 *       Pads (as above) and returns an array of Uint8Array blocks, each
 *       exactly blockBytes long. Empty input gives an empty array.
 *
 *  5. padMessageDetailed(bytes, blockBytes, appendLength = false)
 *       Same padding, but also returns a breakdown for the visualizer:
 *       the padded bytes, the blocks, counts of message / padding / length
 *       bytes, and `segments` ({ type, start, end }) so the UI can colour
 *       "M", "Padding bits" and "Length of M" like the Slide 2 diagram.
 *
 *  DEFAULT BEHAVIOUR (important for the other files)
 *  -------------------------------------------------
 *  appendLength is OFF by default. xorHash.js, rxorHash.js, forgery.js and
 *  collision.js all assume plain zero padding with NO length block, so the
 *  forgery math matches the real hash functions exactly. Turning the length
 *  field on is only for the visualizer demo of Slide 2. (The forgery would
 *  still be possible with a length field, but forgery.js would have to
 *  include the length block in its calculation.)
 *
 *  ERROR HANDLING
 *  --------------
 *  - blockBytes must be a positive integer, otherwise an Error is thrown.
 *  - Input arrays are never modified; new arrays are always returned.
 *
 *  USED BY : js/core/xorHash.js, js/core/rxorHash.js, js/attacks/collision.js,
 *            js/ui/visualizerView.js
 *  DEPENDS : nothing (standalone module)
 * ============================================================================
 */

/** Minimum size of the length field in bytes (a 64-bit length). */
const MIN_LENGTH_FIELD_BYTES = 8;

/** Throw if the block size is not a positive integer. */
function assertBlockBytes(blockBytes) {
  if (!Number.isInteger(blockBytes) || blockBytes < 1) {
    throw new Error('blockBytes must be a positive integer');
  }
}

/**
 * Number of zero bytes needed to reach the next block boundary.
 * @param {number} length      Current length in bytes
 * @param {number} blockBytes  Block size in bytes
 * @returns {number} 0 .. blockBytes - 1
 */
export function paddingNeeded(length, blockBytes) {
  assertBlockBytes(blockBytes);
  return (blockBytes - (length % blockBytes)) % blockBytes;
}

/**
 * Size of the length field in bytes: at least 8, rounded up to whole blocks.
 * @param {number} blockBytes
 * @returns {number}
 */
export function lengthFieldSize(blockBytes) {
  assertBlockBytes(blockBytes);
  return Math.ceil(MIN_LENGTH_FIELD_BYTES / blockBytes) * blockBytes;
}

/**
 * Internal: build the padded message plus a description of its parts.
 */
function buildPadded(bytes, blockBytes, appendLength) {
  assertBlockBytes(blockBytes);
  const message = Uint8Array.from(bytes);

  const paddingBytes = paddingNeeded(message.length, blockBytes);
  const lengthBytes = appendLength ? lengthFieldSize(blockBytes) : 0;

  const padded = new Uint8Array(message.length + paddingBytes + lengthBytes);
  padded.set(message, 0); // padding bytes are already zero

  if (appendLength) {
    // Original length in BITS, big-endian, right-aligned in the length field.
    let value = BigInt(message.length) * 8n;
    for (let i = padded.length - 1; i >= padded.length - lengthBytes; i--) {
      padded[i] = Number(value & 0xffn);
      value >>= 8n;
    }
  }

  return { padded, messageBytes: message.length, paddingBytes, lengthBytes };
}

/** Cut an aligned byte array into blocks of blockBytes. */
function cutIntoBlocks(padded, blockBytes) {
  const blocks = [];
  for (let offset = 0; offset < padded.length; offset += blockBytes) {
    blocks.push(padded.slice(offset, offset + blockBytes));
  }
  return blocks;
}

/**
 * Pad a message to a multiple of the block size.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} blockBytes
 * @param {boolean} appendLength  Also append the original length in bits
 * @returns {Uint8Array} new padded array
 */
export function padToBlockSize(bytes, blockBytes, appendLength = false) {
  return buildPadded(bytes, blockBytes, appendLength).padded;
}

/**
 * Pad a message and cut it into blocks.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} blockBytes
 * @param {boolean} appendLength  Also append the original length in bits
 * @returns {Uint8Array[]} blocks, each exactly blockBytes long
 */
export function splitIntoBlocks(bytes, blockBytes, appendLength = false) {
  const { padded } = buildPadded(bytes, blockBytes, appendLength);
  return cutIntoBlocks(padded, blockBytes);
}

/**
 * Pad a message and describe every part of the result (for the visualizer).
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} blockBytes
 * @param {boolean} appendLength
 * @returns {{
 *   padded:Uint8Array, blocks:Uint8Array[], blockBytes:number,
 *   messageBytes:number, paddingBytes:number, lengthBytes:number,
 *   originalBits:number,
 *   segments:{ type:'message'|'padding'|'length', start:number, end:number }[]
 * }}
 */
export function padMessageDetailed(bytes, blockBytes, appendLength = false) {
  const { padded, messageBytes, paddingBytes, lengthBytes } = buildPadded(
    bytes,
    blockBytes,
    appendLength
  );

  // Byte ranges [start, end) for the Slide 2 diagram; empty parts are skipped.
  const segments = [];
  let cursor = 0;
  const addSegment = (type, size) => {
    if (size > 0) segments.push({ type, start: cursor, end: cursor + size });
    cursor += size;
  };
  addSegment('message', messageBytes);
  addSegment('padding', paddingBytes);
  addSegment('length', lengthBytes);

  return {
    padded,
    blocks: cutIntoBlocks(padded, blockBytes),
    blockBytes,
    messageBytes,
    paddingBytes,
    lengthBytes,
    originalBits: messageBytes * 8,
    segments,
  };
}