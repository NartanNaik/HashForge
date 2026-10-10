/**
 * ============================================================================
 *  File    : js/core/sha256.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : SHA-256 wrapper (the "real" cryptographic hash for comparison)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Gives the project a genuine cryptographic hash to compare against XOR and
 *  RXOR. We do NOT implement SHA-256 ourselves: we call the browser's built-in
 *  Web Crypto API (crypto.subtle.digest), which is fast and correct.
 *
 *  It is used to show that:
 *    - flipping ONE input bit changes about half of SHA-256's output bits
 *      (avalanche.js), whereas XOR and RXOR change just one bit;
 *    - the forged messages that collide under XOR / RXOR hash to completely
 *      different SHA-256 values (forgeryView.js);
 *    - finding a collision on a TRUNCATED SHA-256 takes about 2^(bits/2)
 *      attempts, and is infeasible at the full 256 bits (collision.js).
 *
 *  WHAT I IMPLEMENTED (exported functions)   [both are async]
 *  ---------------------------------------
 *  1. sha256(bytes)
 *       Returns the full 32-byte (256-bit) digest as a Uint8Array.
 *
 *  2. sha256Truncated(bytes, bits)
 *       Returns only the FIRST `bits` bits of the SHA-256 digest (1 to 256),
 *       as ceil(bits / 8) bytes. If `bits` is not a multiple of 8, the unused
 *       low bits of the last byte are set to zero.
 *       Example: bits = 12 -> 2 bytes, the second byte keeps only its top
 *       4 bits.
 *
 *  KNOWN TEST VECTOR (use it in a test)
 *  ------------------------------------
 *    SHA-256("abc") =
 *    ba7816bf 8f01cfea 414140de 5dae2223 b00361a3 96177a9c b410ff61 f20015ad
 *
 *  ENVIRONMENT NOTES
 *  -----------------
 *  - Browsers only expose crypto.subtle in a SECURE CONTEXT: https:// or
 *    http://localhost. Opening the page through a plain http:// LAN address
 *    (for example http://192.168.x.x) will NOT work. GitHub Pages and Netlify
 *    are https, and `npm start` serves on localhost, so both are fine.
 *  - Node 18 does not expose a global `crypto`, so this file falls back to
 *    node:crypto's webcrypto automatically. Tests therefore work on Node 18+.
 *
 *  ERROR HANDLING
 *  --------------
 *  - If no SubtleCrypto is available, a clear Error explains the secure
 *    context requirement.
 *  - sha256Truncated throws if `bits` is not an integer between 1 and 256.
 *
 *  USED BY : js/attacks/avalanche.js, js/attacks/collision.js,
 *            js/ui/forgeryView.js, js/ui/collisionView.js
 *  DEPENDS : Web Crypto API (browser) or node:crypto (tests)
 * ============================================================================
 */

/** Cached SubtleCrypto instance, found once and reused for speed. */
let subtlePromise = null;

/**
 * Find a SubtleCrypto implementation (browser first, Node fallback).
 * @returns {Promise<SubtleCrypto>}
 */
function getSubtle() {
  if (!subtlePromise) {
    subtlePromise = (async () => {
      if (globalThis.crypto && globalThis.crypto.subtle) {
        return globalThis.crypto.subtle;
      }
      try {
        // Node 18 fallback (this branch is never reached in a normal browser)
        const nodeCrypto = await import('node:crypto');
        if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
          return nodeCrypto.webcrypto.subtle;
        }
      } catch {
        // fall through to the error below
      }
      throw new Error(
        'SHA-256 needs the Web Crypto API. Open the app over https:// or ' +
          'http://localhost (plain http:// on a network address is blocked by the browser).'
      );
    })();
    // Do not cache a failure forever: allow a retry on the next call.
    subtlePromise.catch(() => {
      subtlePromise = null;
    });
  }
  return subtlePromise;
}

/**
 * Compute the SHA-256 digest of a byte array.
 *
 * @param {Uint8Array|number[]} bytes
 * @returns {Promise<Uint8Array>} 32-byte digest
 */
export async function sha256(bytes) {
  const subtle = await getSubtle();
  const input = Uint8Array.from(bytes);
  const digest = await subtle.digest('SHA-256', input);
  return new Uint8Array(digest);
}

/**
 * Compute SHA-256 and keep only the first `bits` bits.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {number} bits  1 to 256
 * @returns {Promise<Uint8Array>} ceil(bits / 8) bytes, unused low bits zeroed
 */
export async function sha256Truncated(bytes, bits) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 256) {
    throw new Error('bits must be an integer between 1 and 256');
  }

  const full = await sha256(bytes);
  const out = full.slice(0, Math.ceil(bits / 8));

  const extraBits = bits % 8;
  if (extraBits !== 0) {
    // Keep only the top `extraBits` bits of the last byte.
    out[out.length - 1] &= (0xff << (8 - extraBits)) & 0xff;
  }
  return out;
}