/**
 * ============================================================================
 *  File    : js/ui/components/hashCard.js
 *  Project : Hash Forge
 *  Module  : Hash display card (hex + binary + copy + match/mismatch state)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  A small reusable card that shows ONE hash value clearly:
 *    - a title (for example "XOR hash" or "SHA-256") and its size in bits
 *    - the hash in HEX (grouped in 4s for readability)
 *    - the hash in BINARY
 *    - a COPY button that copies the plain hex string
 *    - an optional bit grid (changed bits can be highlighted)
 *    - a MATCH / MISMATCH state with a text status, used for the green
 *      "HASHES MATCH" banner in the Forgery Lab and the red mismatch for
 *      SHA-256 in the comparison.
 *
 *  Like bitGrid.js, it builds DOM with createElement/textContent only (never
 *  innerHTML), so nothing typed by the user can inject HTML.
 *
 *  WHAT I IMPLEMENTED (exported functions)
 *  ---------------------------------------
 *  1. renderHashCard(options) -> HTMLElement
 *       Builds a new card. Options:
 *         title            string   heading, e.g. "XOR hash of forged message"
 *         hash             Uint8Array|number[]   the hash bytes
 *         state            'neutral' | 'match' | 'mismatch'   (default 'neutral')
 *         statusText       string   overrides the default status wording
 *         showGrid         boolean  also draw a bitGrid below (default false)
 *         highlightChanged Uint8Array|number[]   passed to the bit grid to
 *                                    mark changed bits (needs showGrid)
 *
 *  2. updateHashCard(card, options)
 *       Updates an existing card in place (same options as above, all
 *       optional). Use it to refresh the card after a new calculation without
 *       rebuilding the page, so the match/mismatch change can be animated
 *       with CSS.
 *
 *  STATES AND STATUS TEXT (never colour-only)
 *  ------------------------------------------
 *    neutral   no status line shown
 *    match     "✔ Hashes match"
 *    mismatch  "✘ Hashes differ"
 *  The status line is an aria-live="polite" region, so screen readers
 *  announce the result when it changes.
 *
 *  LONG HASHES
 *  -----------
 *  Hashes longer than 8 bytes (for example SHA-256, 256 bits) put the binary
 *  string inside a collapsed <details> element, because 256 binary digits are
 *  long. Short hashes (the 16-bit demo size) show binary directly.
 *
 *  CSS CLASSES / ATTRIBUTES (style them in css/components.css)
 *  -----------------------------------------------------------
 *    .hash-card                the card; [data-state="neutral|match|mismatch"]
 *    .hash-card-header         title + size row
 *    .hash-card-title          the heading
 *    .hash-card-bits           "16 bits" label
 *    .hash-card-row            a labelled line (Hex / Binary)
 *    .hash-card-label          "Hex" / "Binary"
 *    .hash-card-value          the monospace hash text
 *    .hash-card-copy           the copy button
 *    .hash-card-grid           container for the optional bit grid
 *    .hash-card-status         the match / mismatch line
 *  Internal lookups use data-role attributes: hex, binary, bits, grid,
 *  status, copy.
 *
 *  COPY BUTTON
 *  -----------
 *  Uses navigator.clipboard when available (https or localhost) and falls
 *  back to a hidden textarea + execCommand otherwise. The button text briefly
 *  becomes "Copied!" (or "Copy failed").
 *
 *  USED BY : forgeryView.js, visualizerView.js, collisionView.js
 *  DEPENDS : core/bitUtils.js, ui/components/bitGrid.js
 * ============================================================================
 */

import { bytesToHex, bytesToBinaryString } from '../../core/bitUtils.js';
import { renderBitGrid } from './bitGrid.js';

/** Hashes longer than this many bytes get a collapsed binary view. */
const LONG_HASH_BYTES = 8;

/** How long the "Copied!" feedback stays on the button (ms). */
const COPY_FEEDBACK_MS = 1500;

const STATUS_TEXT = Object.freeze({
  match: '\u2714 Hashes match',
  mismatch: '\u2718 Hashes differ',
});

/** Create an element with an optional class name and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Insert a space every 4 hex characters: "4849a1b2" -> "4849 a1b2". */
function groupHex(hex) {
  return hex.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Copy text to the clipboard. Returns true on success. */
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy method
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Find a part of the card by its data-role. */
function part(card, role) {
  return card.querySelector(`[data-role="${role}"]`);
}

/**
 * Build a labelled row: <div class="hash-card-row"> label + value [+ button]
 */
function buildRow(labelText, role) {
  const row = el('div', 'hash-card-row');
  row.appendChild(el('span', 'hash-card-label', labelText));
  const value = el('code', 'hash-card-value');
  value.dataset.role = role;
  row.appendChild(value);
  return row;
}

/**
 * Update an existing card in place.
 *
 * @param {HTMLElement} card
 * @param {{ title?:string, hash?:Uint8Array|number[], state?:string,
 *           statusText?:string, highlightChanged?:Uint8Array|number[] }} options
 */
export function updateHashCard(card, options = {}) {
  const { title, hash, state, statusText, highlightChanged } = options;

  if (title !== undefined) {
    card.querySelector('.hash-card-title').textContent = title;
  }

  if (hash !== undefined) {
    const bytes = Array.from(hash);
    const hex = bytesToHex(bytes);
    card.dataset.hex = hex; // the copy button reads this

    part(card, 'hex').textContent = hex ? groupHex(hex) : '(empty)';
    part(card, 'binary').textContent = bytes.length ? bytesToBinaryString(bytes) : '(empty)';
    part(card, 'bits').textContent = `${bytes.length * 8} bits`;

    if (card.dataset.showGrid === 'true') {
      part(card, 'grid').replaceChildren(
        renderBitGrid(bytes, {
          bytesPerRow: bytes.length > LONG_HASH_BYTES ? 8 : 4,
          highlightChanged,
          label: `Bits of ${card.querySelector('.hash-card-title').textContent}`,
        })
      );
    }
  }

  if (state !== undefined || statusText !== undefined) {
    const nextState = state !== undefined ? state : card.dataset.state;
    card.dataset.state = nextState;

    const status = part(card, 'status');
    const text = statusText !== undefined ? statusText : STATUS_TEXT[nextState] || '';
    status.textContent = text;
    status.hidden = text === '';
  }
}

/**
 * Build a new hash card.
 *
 * @param {{ title?:string, hash:Uint8Array|number[], state?:'neutral'|'match'|'mismatch',
 *           statusText?:string, showGrid?:boolean,
 *           highlightChanged?:Uint8Array|number[] }} options
 * @returns {HTMLElement} the .hash-card element (not yet attached to the page)
 */
export function renderHashCard(options = {}) {
  const {
    title = 'Hash',
    hash = [],
    state = 'neutral',
    statusText,
    showGrid = false,
    highlightChanged,
  } = options;

  const bytes = Array.from(hash);

  const card = el('article', 'hash-card');
  card.dataset.state = 'neutral';
  card.dataset.showGrid = showGrid ? 'true' : 'false';
  card.dataset.hex = '';

  // Header: title + size
  const header = el('header', 'hash-card-header');
  header.appendChild(el('h4', 'hash-card-title', title));
  const bits = el('span', 'hash-card-bits');
  bits.dataset.role = 'bits';
  header.appendChild(bits);
  card.appendChild(header);

  // Hex row with copy button
  const hexRow = buildRow('Hex', 'hex');
  const copy = el('button', 'hash-card-copy', 'Copy');
  copy.type = 'button';
  copy.dataset.role = 'copy';
  copy.setAttribute('aria-label', `Copy ${title} as hex`);
  copy.addEventListener('click', async () => {
    const ok = await copyText(card.dataset.hex);
    copy.textContent = ok ? 'Copied!' : 'Copy failed';
    setTimeout(() => {
      copy.textContent = 'Copy';
    }, COPY_FEEDBACK_MS);
  });
  hexRow.appendChild(copy);
  card.appendChild(hexRow);

  // Binary row (collapsed for long hashes)
  const binaryRow = buildRow('Binary', 'binary');
  if (bytes.length > LONG_HASH_BYTES) {
    const details = el('details', 'hash-card-details');
    details.appendChild(el('summary', undefined, `Show binary (${bytes.length * 8} bits)`));
    details.appendChild(binaryRow);
    card.appendChild(details);
  } else {
    card.appendChild(binaryRow);
  }

  // Optional bit grid
  if (showGrid) {
    const gridHost = el('div', 'hash-card-grid');
    gridHost.dataset.role = 'grid';
    card.appendChild(gridHost);
  }

  // Status line (aria-live so screen readers announce changes)
  const status = el('p', 'hash-card-status');
  status.dataset.role = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  card.appendChild(status);

  updateHashCard(card, { hash: bytes, state, statusText, highlightChanged });
  return card;
}