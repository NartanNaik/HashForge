/**
 * ============================================================================
 *  File    : js/attacks/forgery.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Forgery Attack (proves Slide 10: "only the hash code is encrypted")
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Pure logic (no DOM). It performs the attack described on Slide 10:
 *
 *    The message is sent in PLAINTEXT and only its hash code is protected.
 *    An attacker writes an alternative (malicious) message, then APPENDS one
 *    extra n-bit block that forces the forged message to produce exactly the
 *    SAME hash as the original. The receiver recalculates the hash, sees a
 *    match, and never detects the modification.
 *
 *  THE MATH (this is what you explain in the viva)
 *  -----------------------------------------------
 *  Let T be the target hash (the hash of the ORIGINAL message).
 *
 *  XOR hash:    h = B1 ^ B2 ^ ... ^ Bm
 *    Let S = XOR of all blocks of the (padded) forged message.
 *    Append X = S ^ T.
 *    New hash = S ^ X = S ^ S ^ T = T.                          [OK]
 *
 *  RXOR hash:   h = 0;  for each block: h = ROL1(h) ^ Bi
 *    Process the (padded) forged message to get h'.
 *    Append X = ROL1(h') ^ T.
 *    The next step gives ROL1(h') ^ X = ROL1(h') ^ ROL1(h') ^ T = T.   [OK]
 *
 *  So the rotation in RXOR defeats the "swap blocks" trick (see collision.js)
 *  but NOT this "append a correcting block" trick.
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. forgeXor(forgedMsgBytes, targetHash, blockBytes)
 *       Zero-pads the forged message to a block boundary, computes the
 *       correcting block for XOR, appends it, and self-checks the result.
 *
 *  2. forgeRxor(forgedMsgBytes, targetHash, blockBytes)
 *       Same idea using the rotate-then-correct formula for RXOR.
 *
 *  Both return the same shape:
 *    {
 *      paddedMessage      forged message after zero-padding
 *      appendedBlock      the n-bit correcting block (raw bytes)
 *      appendedHex        the block in hex (always readable in the UI)
 *      appendedPreview    the block as text, non-printable bytes shown as "."
 *      appendedIsPrintable true if the block happens to be plain text
 *      finalMessage       paddedMessage + appendedBlock (what the attacker sends)
 *      finalHash          hash of finalMessage, computed by the REAL hash code
 *      targetHash         the target we aimed for
 *      verified           true when finalHash equals targetHash
 *      paddingAdded       number of zero bytes added to align the message
 *      blockBytes         block size used
 *    }
 *
 *  SELF-CHECK
 *  ----------
 *  After building the forgery, finalHash is recomputed with the real
 *  xorHash()/rxorHash() from core/. If it does not equal the target, an Error
 *  is thrown, so a wrong forgery can never be shown as a success.
 *
 *  INPUT RULES
 *  -----------
 *  - targetHash may be bytes (Uint8Array / array) or a hex string.
 *  - targetHash length must equal blockBytes (the hash is one block wide).
 *  - blockBytes must be a positive integer.
 *
 *  HONEST LIMITATION (state this in the demo)
 *  ------------------------------------------
 *  The appended block is essentially arbitrary bytes, so it may look like
 *  unreadable characters. The UI shows it in hex. In a real attack it could
 *  be hidden, for example in a comment field or trailing data.
 *
 *  ASSUMPTION
 *  ----------
 *  xorHash()/rxorHash() in core/ pad the final partial block with zero bytes
 *  and do NOT append a length block by default. This file uses the same zero
 *  padding, so the math above matches the real hash functions exactly.
 *
 *  EXPECTED SIGNATURES FROM OTHER FILES (to be written next)
 *  ---------------------------------------------------------
 *    bitUtils.js : xorBytes(a, b)        -> Uint8Array
 *                  rotateLeft1(bytes)    -> Uint8Array (circular, whole n-bit value)
 *                  hexToBytes(hex)       -> Uint8Array
 *                  bytesToHex(bytes)     -> string
 *    xorHash.js  : xorHash(bytes, blockBytes)  -> Uint8Array
 *    rxorHash.js : rxorHash(bytes, blockBytes) -> Uint8Array
 *
 *  USED BY : js/ui/forgeryView.js, js/attacks/collision.js,
 *            tests/forgery.test.js
 *  DEPENDS : core/bitUtils.js, core/xorHash.js, core/rxorHash.js
 * ============================================================================
 */

import { xorBytes, rotateLeft1, hexToBytes, bytesToHex } from '../core/bitUtils.js';
import { xorHash } from '../core/xorHash.js';
import { rxorHash } from '../core/rxorHash.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compare two byte arrays for equality. */
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Validate and normalise the inputs shared by both attacks.
 * @returns {{ message:Uint8Array, target:Uint8Array }}
 */
function normaliseInputs(forgedMsgBytes, targetHash, blockBytes) {
  if (!Number.isInteger(blockBytes) || blockBytes < 1) {
    throw new Error('blockBytes must be a positive integer');
  }
  if (!forgedMsgBytes) {
    throw new Error('Forged message is required');
  }

  const message = Uint8Array.from(forgedMsgBytes);
  const target =
    typeof targetHash === 'string' ? hexToBytes(targetHash) : Uint8Array.from(targetHash || []);

  if (target.length !== blockBytes) {
    throw new Error(
      `Target hash must be ${blockBytes} byte(s) (${blockBytes * 8} bits) ` +
        `but is ${target.length} byte(s). Use the same block size as the hash.`
    );
  }
  return { message, target };
}

/** Zero-pad a message so its length is a multiple of blockBytes. */
function zeroPad(message, blockBytes) {
  const remainder = message.length % blockBytes;
  if (remainder === 0) return Uint8Array.from(message);
  const padded = new Uint8Array(message.length + (blockBytes - remainder));
  padded.set(message, 0);
  return padded;
}

/** Visit each block of an already aligned message. */
function forEachBlock(padded, blockBytes, callback) {
  for (let offset = 0; offset < padded.length; offset += blockBytes) {
    callback(padded.subarray(offset, offset + blockBytes));
  }
}

/** Show bytes as text, replacing non-printable bytes with ".". */
function printablePreview(bytes) {
  let text = '';
  let printable = true;
  for (const b of bytes) {
    if (b >= 32 && b <= 126) {
      text += String.fromCharCode(b);
    } else {
      text += '.';
      printable = false;
    }
  }
  return { text, printable };
}

/** Append one block to the end of a message. */
function appendBlock(message, block) {
  const out = new Uint8Array(message.length + block.length);
  out.set(message, 0);
  out.set(block, message.length);
  return out;
}

/**
 * Build the result object and run the self-check with the REAL hash function.
 */
function buildResult({ message, padded, block, target, blockBytes, hashFn, name }) {
  const finalMessage = appendBlock(padded, block);
  const finalHash = hashFn(finalMessage, blockBytes);
  const verified = bytesEqual(finalHash, target);

  if (!verified) {
    throw new Error(
      `${name} forgery self-check failed: expected ${bytesToHex(target)} ` +
        `but got ${bytesToHex(finalHash)}`
    );
  }

  const preview = printablePreview(block);
  return {
    paddedMessage: padded,
    appendedBlock: block,
    appendedHex: bytesToHex(block),
    appendedPreview: preview.text,
    appendedIsPrintable: preview.printable,
    finalMessage,
    finalHash,
    targetHash: target,
    verified,
    paddingAdded: padded.length - message.length,
    blockBytes,
  };
}

// ---------------------------------------------------------------------------
// 1. XOR forgery
// ---------------------------------------------------------------------------

/**
 * Forge a message so its XOR hash equals `targetHash`.
 *
 * Appended block X = (XOR of all forged blocks) ^ T.
 *
 * @param {Uint8Array|number[]} forgedMsgBytes  The attacker's malicious message
 * @param {Uint8Array|number[]|string} targetHash  Hash of the original message
 * @param {number} blockBytes                   Block size in bytes
 * @returns {object} See the result shape in the file header
 */
export function forgeXor(forgedMsgBytes, targetHash, blockBytes) {
  const { message, target } = normaliseInputs(forgedMsgBytes, targetHash, blockBytes);
  const padded = zeroPad(message, blockBytes);

  // S = XOR of every block of the padded forged message
  let running = new Uint8Array(blockBytes);
  forEachBlock(padded, blockBytes, (block) => {
    running = xorBytes(running, block);
  });

  // Correcting block: X = S ^ T
  const block = xorBytes(running, target);

  return buildResult({
    message,
    padded,
    block,
    target,
    blockBytes,
    hashFn: xorHash,
    name: 'XOR',
  });
}

// ---------------------------------------------------------------------------
// 2. RXOR forgery
// ---------------------------------------------------------------------------

/**
 * Forge a message so its RXOR hash equals `targetHash`.
 *
 * Appended block X = ROL1(h') ^ T, where h' is the RXOR running value after
 * processing the padded forged message.
 *
 * @param {Uint8Array|number[]} forgedMsgBytes  The attacker's malicious message
 * @param {Uint8Array|number[]|string} targetHash  Hash of the original message
 * @param {number} blockBytes                   Block size in bytes
 * @returns {object} See the result shape in the file header
 */
export function forgeRxor(forgedMsgBytes, targetHash, blockBytes) {
  const { message, target } = normaliseInputs(forgedMsgBytes, targetHash, blockBytes);
  const padded = zeroPad(message, blockBytes);

  // h' = running RXOR value: h = ROL1(h) ^ block, starting from zero
  let running = new Uint8Array(blockBytes);
  forEachBlock(padded, blockBytes, (block) => {
    running = xorBytes(rotateLeft1(running), block);
  });

  // Correcting block: X = ROL1(h') ^ T
  const block = xorBytes(rotateLeft1(running), target);

  return buildResult({
    message,
    padded,
    block,
    target,
    blockBytes,
    hashFn: rxorHash,
    name: 'RXOR',
  });
}