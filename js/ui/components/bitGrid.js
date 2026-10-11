/**
 * ============================================================================
 *  File    : js/ui/components/bitGrid.js
 *  Project : Hash Forge
 *  Module  : Reusable bit-grid component (used by almost every view)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  Turns a byte array into a grid of coloured bit cells (one cell per bit,
 *  8 cells per byte). It is the visual building block for:
 *    - the Hash Visualizer     (text -> binary -> blocks -> running hash)
 *    - the Forgery Lab         (the appended correcting block)
 *    - the Predictable-Data Analyzer (heatmap with the always-zero bit)
 *    - the Avalanche test      (output bits that changed, clickable input bits)
 *
 *  It only BUILDS and RETURNS a DOM element; the calling view decides where
 *  to put it. It uses createElement/textContent only (never innerHTML), so
 *  nothing typed by the user can inject HTML.
 *
 *  WHAT I IMPLEMENTED (exported function)
 *  --------------------------------------
 *  renderBitGrid(bytes, options = {}) -> HTMLElement
 *
 *  OPTIONS
 *    bytesPerRow        number    bytes per row (default 4; use 1 for a heatmap)
 *    showValues         boolean   print 0 / 1 inside each cell (default true)
 *    showHex            boolean   show each byte's hex value after it (default false)
 *    showBitPositions   boolean   header row "7 6 5 4 3 2 1 0" above the grid
 *                                 (default false), like Slide 3 Step 2
 *    highlightChanged   Uint8Array|number[]
 *                                 XOR-difference mask, same length as `bytes`.
 *                                 Cells where the mask bit is 1 get
 *                                 .bit-changed (use avalanche.js `diff`).
 *    fixedPositions     number[]  bit positions to mark .bit-fixed in EVERY
 *                                 byte, using the bitAnalyzer.js numbering
 *                                 (7 = leftmost / highest-order bit).
 *                                 Pass analysis.fixed.map(f => f.position).
 *    selectedIndex      number    global bit index to mark .bit-selected
 *    onCellClick        function  (bitIndex, byteIndex, column) => void.
 *                                 When given, cells become <button>s so the
 *                                 user can click a bit (e.g. to flip it).
 *    maxBytes           number    draw at most this many bytes (default 512);
 *                                 a "... N more bytes" note is added after.
 *    label              string    accessible label for the whole grid
 *
 *  BIT NUMBERING (two conventions, both used on purpose)
 *  -----------------------------------------------------
 *    - bitIndex passed to onCellClick / selectedIndex is the GLOBAL index
 *      used by bitUtils.flipBit(): 0 = leftmost bit of the first byte.
 *    - fixedPositions uses the bitAnalyzer numbering: 7 = leftmost bit
 *      inside a byte. The component converts it (column = 7 - position).
 *
 *  CSS CLASSES THIS COMPONENT USES (style them in css/components.css)
 *  ------------------------------------------------------------------
 *    .bit-grid          the container
 *    .bit-row           one row of bytes (also .bit-positions for the header)
 *    .bit-byte          one group of 8 cells (+ optional .bit-hex label)
 *    .bit-cell          a single bit, plus exactly one of:
 *                         .bit-0   .bit-1
 *                       and optionally:
 *                         .bit-changed   .bit-fixed   .bit-selected
 *                         .bit-clickable (when onCellClick is used)
 *    .bit-hex           the hex label after a byte
 *    .bit-position      a header label cell
 *    .bit-more          the "... more bytes" note
 *  Each cell also carries data-bit-index, data-byte-index and data-column
 *  attributes, which help with animations and tests.
 *
 *  ACCESSIBILITY
 *  -------------
 *  The grid has role="group" and an aria-label (the binary of the first few
 *  bytes by default). Individual cells are hidden from screen readers unless
 *  clickable, in which case each button has its own descriptive aria-label.
 *  Meaning is never colour-only: with showValues on, every cell prints its
 *  0 or 1.
 *
 *  USED BY : visualizerView.js, forgeryView.js, analyzerView.js,
 *            collisionView.js, hashCard.js
 *  DEPENDS : core/bitUtils.js (bytesToBinaryString)
 * ============================================================================
 */

import { bytesToBinaryString } from '../../core/bitUtils.js';

const BITS_PER_BYTE = 8;
const DEFAULT_BYTES_PER_ROW = 4;
const DEFAULT_MAX_BYTES = 512;
const LABEL_PREVIEW_BYTES = 8;

/** Create an element with an optional class name and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Default accessible label: binary of the first few bytes. */
function defaultLabel(bytes) {
  if (bytes.length === 0) return 'Empty bit grid';
  const preview = bytesToBinaryString(bytes.slice(0, LABEL_PREVIEW_BYTES));
  const more = bytes.length > LABEL_PREVIEW_BYTES ? ' ...' : '';
  return `${bytes.length} byte(s): ${preview}${more}`;
}

/** Build the "7 6 5 4 3 2 1 0" header row for one row of bytes. */
function buildPositionsRow(bytesInRow) {
  const row = el('div', 'bit-row bit-positions');
  row.setAttribute('aria-hidden', 'true');
  for (let b = 0; b < bytesInRow; b++) {
    const group = el('div', 'bit-byte');
    for (let column = 0; column < BITS_PER_BYTE; column++) {
      group.appendChild(el('span', 'bit-position', String(BITS_PER_BYTE - 1 - column)));
    }
    row.appendChild(group);
  }
  return row;
}

/**
 * Render bytes as a grid of bit cells.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {object} [options]  See the OPTIONS list in the file header
 * @returns {HTMLElement} the .bit-grid element (not yet attached to the page)
 */
export function renderBitGrid(bytes, options = {}) {
  const {
    bytesPerRow = DEFAULT_BYTES_PER_ROW,
    showValues = true,
    showHex = false,
    showBitPositions = false,
    highlightChanged = null,
    fixedPositions = [],
    selectedIndex = null,
    onCellClick = null,
    maxBytes = DEFAULT_MAX_BYTES,
    label = null,
  } = options;

  const perRow = Number.isInteger(bytesPerRow) && bytesPerRow > 0 ? bytesPerRow : DEFAULT_BYTES_PER_ROW;
  const data = Array.from(bytes);
  const shown = Math.min(data.length, maxBytes);

  // Columns to mark as fixed (convert bitAnalyzer position -> column from left)
  const fixedColumns = new Set(fixedPositions.map((position) => BITS_PER_BYTE - 1 - position));

  const grid = el('div', 'bit-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', label || defaultLabel(data));

  if (shown === 0) return grid;

  if (showBitPositions) {
    grid.appendChild(buildPositionsRow(Math.min(perRow, shown)));
  }

  let row = null;
  for (let byteIndex = 0; byteIndex < shown; byteIndex++) {
    if (byteIndex % perRow === 0) {
      row = el('div', 'bit-row');
      grid.appendChild(row);
    }

    const value = data[byteIndex] & 0xff;
    const mask = highlightChanged ? highlightChanged[byteIndex] & 0xff : 0;
    const group = el('div', 'bit-byte');

    for (let column = 0; column < BITS_PER_BYTE; column++) {
      const bit = (value >> (BITS_PER_BYTE - 1 - column)) & 1;
      const bitIndex = byteIndex * BITS_PER_BYTE + column; // matches flipBit()
      const position = BITS_PER_BYTE - 1 - column; // 7 = leftmost

      let classes = `bit-cell bit-${bit}`;
      if ((mask >> position) & 1) classes += ' bit-changed';
      if (fixedColumns.has(column)) classes += ' bit-fixed';
      if (selectedIndex === bitIndex) classes += ' bit-selected';

      let cell;
      if (typeof onCellClick === 'function') {
        cell = el('button', `${classes} bit-clickable`, showValues ? String(bit) : '');
        cell.type = 'button';
        cell.setAttribute(
          'aria-label',
          `Byte ${byteIndex}, bit ${position}, value ${bit}. Activate to select.`
        );
        cell.addEventListener('click', () => onCellClick(bitIndex, byteIndex, column));
      } else {
        cell = el('span', classes, showValues ? String(bit) : '');
        cell.setAttribute('aria-hidden', 'true');
      }

      cell.title = `byte ${byteIndex}, bit ${position} = ${bit}`;
      cell.dataset.bitIndex = String(bitIndex);
      cell.dataset.byteIndex = String(byteIndex);
      cell.dataset.column = String(column);
      group.appendChild(cell);
    }

    if (showHex) {
      const hex = el('span', 'bit-hex', value.toString(16).padStart(2, '0'));
      hex.setAttribute('aria-hidden', 'true');
      group.appendChild(hex);
    }

    row.appendChild(group);
  }

  if (data.length > shown) {
    grid.appendChild(el('p', 'bit-more', `... ${data.length - shown} more byte(s) not shown`));
  }

  return grid;
}