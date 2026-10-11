/**
 * ============================================================================
 *  File    : js/ui/analyzerView.js
 *  Project : Hash Forge
 *  Module  : Predictable-Data Analyzer view (proves Slide 3: 2^-112 vs 2^-128)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  The screen for Module 3. The user pastes text, uploads a file, or loads a
 *  sample, and the app proves the textbook claim on REAL data:
 *
 *    Ordinary ASCII text always has a 0 in the highest-order bit of each
 *    byte. A simple XOR hash of 16 bytes (128 bits) therefore has 16 bits
 *    that can never change, leaving only 112 variable bits, so the chance of
 *    an undetected error rises from 2^-128 to 2^-112.
 *
 *  All calculation is done by analysis/bitAnalyzer.js. This file only
 *  collects input and draws the result.
 *
 *  WHAT THE SCREEN SHOWS
 *  ---------------------
 *  1. Input panel      textarea (paste), file upload, "Load sample text",
 *                      "Load random bytes" (the contrast case), "Clear", and
 *                      a hash-size selector (32 / 64 / 128 / 256 bits).
 *  2. Summary cards    bytes analysed, fixed bit positions, effective bits
 *                      (e.g. "112 of 128").
 *  3. Bit frequency    a table for bit 7 ... bit 0: percentage of bytes where
 *     table            that bit is 1, with a bar and a TEXT verdict
 *                      ("Always 0 (fixed)", "Always 1 (fixed)" or "Varies").
 *  4. Heatmap          bitGrid of the first 256 bytes; the always-fixed
 *                      columns are highlighted (the bit 7 column for ASCII).
 *  5. Calculation      the Slide 3 Step 4 / Step 5 working, step by step.
 *  6. Comparison       random data (2^-n) versus this data (2^-effective).
 *
 *  WHAT I IMPLEMENTED (exported function)
 *  --------------------------------------
 *  renderAnalyzerView(container) -> cleanup function
 *     Builds the whole view inside `container` (an element supplied by
 *     router.js) and returns a function that stops pending timers. The
 *     router should call that function before showing another view.
 *
 *  VIEW CONTRACT (the same for every view file)
 *  --------------------------------------------
 *     export function renderXxxView(container) { ...; return cleanup; }
 *  router.js will call it with the empty #view element.
 *
 *  BEHAVIOUR NOTES
 *  ---------------
 *  - Typed / pasted text is converted with textToBytes (UTF-8). Plain ASCII
 *    keeps bit 7 = 0. Try typing an accented letter or an emoji: UTF-8
 *    multi-byte characters have bit 7 = 1, so the fixed bit disappears. This
 *    makes a good live demo.
 *  - Analysis of typed text is debounced (150 ms).
 *  - Files up to 5 MB are accepted. Errors are shown with toast.error().
 *  - Samples under 64 bytes show a warning: with very little data a bit can
 *    look "fixed" by pure chance (for example the text "HI").
 *  - "Load sample text" fetches assets/sample-files/english.txt and falls
 *    back to a built-in paragraph if the file cannot be loaded.
 *  - Everything is built with createElement/textContent (no innerHTML).
 *
 *  CSS CLASSES (style them in css/components.css and css/layout.css)
 *  -----------------------------------------------------------------
 *    .analyzer-view  .analyzer-intro  .analyzer-controls  .analyzer-actions
 *    .analyzer-hint  .analyzer-results  .analyzer-empty  .analyzer-source
 *    .analyzer-warning  .analyzer-stats  .stat-card (.stat-label, .stat-value,
 *    .stat-note)  .analyzer-section  .freq-table  .freq-bar  .freq-fill
 *    .freq-fixed (row where the bit is fixed)  .analyzer-heatmap
 *    .analyzer-note  .analyzer-steps  .compare-table
 *
 *  USED BY : js/ui/router.js (route #/analyzer)
 *  DEPENDS : analysis/bitAnalyzer.js, core/bitUtils.js, core/config.js,
 *            ui/components/bitGrid.js, ui/components/toast.js
 * ============================================================================
 */

import { analyzeBytes } from '../analysis/bitAnalyzer.js';
import { textToBytes } from '../core/bitUtils.js';
import { ANALYZER_HASH_BITS } from '../core/config.js';
import { renderBitGrid } from './components/bitGrid.js';
import { toast } from './components/toast.js';

const HASH_SIZE_CHOICES = [32, 64, 128, 256];
const MIN_RELIABLE_BYTES = 64;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RANDOM_BYTE_COUNT = 256;
const DEBOUNCE_MS = 150;
const SAMPLE_PATH = 'assets/sample-files/english.txt';
const SAMPLE_FALLBACK =
  'A hash function takes a message of any length and produces a short value of fixed size. ' +
  'Ordinary English text is stored as ASCII, where the leftmost bit of every byte is zero. ' +
  'That predictable pattern means a simple XOR hash wastes some of its output bits.';

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------

/** Create an element with an optional class name and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Append "2" + superscript exponent, e.g. 2^-112, to a parent node. */
function appendPower(parent, exponent) {
  parent.appendChild(document.createTextNode('2'));
  parent.appendChild(el('sup', undefined, String(exponent)));
}

/** A labelled section with a heading. */
function section(title, className = '') {
  const node = el('section', `analyzer-section ${className}`.trim());
  node.appendChild(el('h3', undefined, title));
  return node;
}

/** One summary card. */
function statCard(label, value, note) {
  const card = el('div', 'stat-card');
  card.appendChild(el('span', 'stat-label', label));
  card.appendChild(el('strong', 'stat-value', value));
  if (note) card.appendChild(el('span', 'stat-note', note));
  return card;
}

/** Verdict text for one bit position (never colour-only). */
function verdictFor(position, fixedMap) {
  const fixed = fixedMap.get(position);
  if (!fixed) return 'Varies';
  return fixed.value === 0 ? 'Always 0 (fixed)' : 'Always 1 (fixed)';
}

// ---------------------------------------------------------------------------
// Result sections
// ---------------------------------------------------------------------------

function buildFrequencyTable(analysis) {
  const box = section('Bit-position frequency');
  const fixedMap = new Map(analysis.fixed.map((f) => [f.position, f]));

  const table = el('table', 'freq-table');
  table.appendChild(el('caption', undefined, 'How often each bit position holds a 1'));

  const head = el('thead');
  const headRow = el('tr');
  ['Bit position', '% of bytes where bit = 1', 'Verdict'].forEach((text) => {
    const th = el('th', undefined, text);
    th.scope = 'col';
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');
  for (let position = 7; position >= 0; position--) {
    const percent = analysis.frequency[position] * 100;
    const row = el('tr', fixedMap.has(position) ? 'freq-fixed' : '');

    const labelCell = el('th', undefined, position === 7 ? 'Bit 7 (highest-order)' : `Bit ${position}`);
    labelCell.scope = 'row';

    const barCell = el('td');
    const bar = el('span', 'freq-bar');
    const fill = el('span', 'freq-fill');
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);
    barCell.append(bar, document.createTextNode(` ${percent.toFixed(1)}%`));

    row.append(labelCell, barCell, el('td', undefined, verdictFor(position, fixedMap)));
    body.appendChild(row);
  }
  table.appendChild(body);

  const wrap = el('div', 'table-scroll');
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

function buildHeatmap(analysis) {
  const box = section('Bit heatmap', 'analyzer-heatmap');
  const fixedPositions = analysis.fixed.map((f) => f.position);

  const legend =
    fixedPositions.length > 0
      ? 'Highlighted columns never change in this data (the highest-order bit, bit 7, is the leftmost column).'
      : 'No column is fixed: every bit position varies in this data.';
  box.appendChild(el('p', 'analyzer-hint', legend));

  box.appendChild(
    renderBitGrid(analysis.heatmap.bytes, {
      bytesPerRow: 4,
      showValues: true,
      showHex: true,
      showBitPositions: true,
      fixedPositions,
      label: `Heatmap of the first ${analysis.heatmap.bytes.length} bytes`,
    })
  );

  if (analysis.heatmap.truncated) {
    box.appendChild(
      el(
        'p',
        'analyzer-note',
        `Showing the first ${analysis.heatmap.bytes.length} of ${analysis.heatmap.totalBytes} bytes. ` +
          'The statistics above use ALL bytes.'
      )
    );
  }
  return box;
}

function buildCalculation(analysis) {
  const eff = analysis.effective;
  const box = section('Effective hash bits (Slide 3, Steps 4 and 5)');

  const steps = el('ol', 'analyzer-steps');
  steps.appendChild(el('li', undefined, `Hash size: ${eff.hashBits} bits \u00F7 8 = ${eff.hashBytes} bytes`));
  steps.appendChild(
    el('li', undefined, `Fixed bits: ${eff.hashBytes} bytes \u00D7 ${eff.fixedPerByte} fixed bit(s) per byte = ${eff.fixedBits}`)
  );
  steps.appendChild(
    el('li', undefined, `Variable bits: ${eff.hashBits} \u2212 ${eff.fixedBits} = ${eff.effectiveBits}`)
  );

  const probability = el('li');
  probability.appendChild(document.createTextNode('Chance an error leaves the hash unchanged: random data '));
  appendPower(probability, eff.randomExponent);
  probability.appendChild(document.createTextNode(', this data '));
  appendPower(probability, eff.predictableExponent);
  steps.appendChild(probability);
  box.appendChild(steps);

  const conclusion =
    eff.fixedPerByte > 0
      ? `Because the predictable pattern removes ${eff.fixedBits} bits, the simple XOR hash is less effective on this data.`
      : `This data has no fixed bit positions, so a simple XOR hash can use all ${eff.hashBits} bits.`;
  box.appendChild(el('p', 'analyzer-note', conclusion));
  return box;
}

function buildComparison(analysis) {
  const eff = analysis.effective;
  const box = section('Random data versus this data');

  const table = el('table', 'compare-table');
  const head = el('thead');
  const headRow = el('tr');
  ['Type of data', 'Variable bits', 'Effectiveness (undetected-error chance)'].forEach((text) => {
    const th = el('th', undefined, text);
    th.scope = 'col';
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = el('tbody');

  const randomRow = el('tr');
  randomRow.appendChild(el('th', undefined, 'Random data'));
  randomRow.appendChild(el('td', undefined, String(eff.hashBits)));
  const randomCell = el('td');
  appendPower(randomCell, eff.randomExponent);
  randomRow.appendChild(randomCell);

  const thisRow = el('tr');
  thisRow.appendChild(el('th', undefined, 'This data'));
  thisRow.appendChild(el('td', undefined, String(eff.effectiveBits)));
  const thisCell = el('td');
  appendPower(thisCell, eff.predictableExponent);
  thisRow.appendChild(thisCell);

  body.append(randomRow, thisRow);
  table.appendChild(body);

  const wrap = el('div', 'table-scroll');
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

/** Draw everything below the input panel. */
function renderResults(host, analysis, state) {
  host.replaceChildren();

  if (analysis.empty) {
    host.appendChild(
      el('p', 'analyzer-empty', 'Paste text, upload a file, or load a sample to begin the analysis.')
    );
    return;
  }

  host.appendChild(
    el('p', 'analyzer-source', `Analysing: ${state.source} (${analysis.totalBytes} bytes)`)
  );

  if (analysis.totalBytes < MIN_RELIABLE_BYTES) {
    const warning = el(
      'p',
      'analyzer-warning',
      `Small sample: with fewer than ${MIN_RELIABLE_BYTES} bytes, a bit can look fixed by pure chance. ` +
        'Use more data for a reliable result.'
    );
    warning.setAttribute('role', 'note');
    host.appendChild(warning);
  }

  const eff = analysis.effective;
  const stats = el('div', 'analyzer-stats');
  stats.append(
    statCard('Bytes analysed', String(analysis.totalBytes)),
    statCard('Fixed bit positions', `${analysis.fixed.length} of 8 per byte`),
    statCard('Effective hash bits', `${eff.effectiveBits} of ${eff.hashBits}`)
  );
  host.appendChild(stats);

  host.append(
    buildFrequencyTable(analysis),
    buildHeatmap(analysis),
    buildCalculation(analysis),
    buildComparison(analysis)
  );
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * Build the Predictable-Data Analyzer inside `container`.
 *
 * @param {HTMLElement} container  The #view element supplied by the router
 * @returns {() => void} cleanup function (clears pending timers)
 */
export function renderAnalyzerView(container) {
  const state = { bytes: new Uint8Array(0), source: '', hashBits: ANALYZER_HASH_BITS };
  let debounceId = null;

  const root = el('section', 'view analyzer-view');

  // Header
  root.appendChild(el('h2', undefined, 'Predictable-Data Analyzer'));
  root.appendChild(
    el(
      'p',
      'analyzer-intro',
      'Ordinary text is predictably formatted: in ASCII, the highest-order bit of every byte is 0. ' +
        'This tool measures that on your data and shows how many bits of a simple XOR hash are really in use.'
    )
  );

  // Controls
  const controls = el('div', 'analyzer-controls');

  const textLabel = el('label', undefined, 'Paste text to analyse');
  textLabel.htmlFor = 'analyzer-text';
  const textarea = el('textarea');
  textarea.id = 'analyzer-text';
  textarea.rows = 5;
  textarea.placeholder = 'Type or paste any text...';
  const hint = el(
    'p',
    'analyzer-hint',
    'Tip: type an accented letter or an emoji. UTF-8 multi-byte characters set the highest bit, so the fixed bit disappears.'
  );

  const fileLabel = el('label', undefined, 'Or upload a file (up to 5 MB)');
  fileLabel.htmlFor = 'analyzer-file';
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.id = 'analyzer-file';

  const sizeLabel = el('label', undefined, 'Hash size');
  sizeLabel.htmlFor = 'analyzer-hashbits';
  const sizeSelect = el('select');
  sizeSelect.id = 'analyzer-hashbits';
  HASH_SIZE_CHOICES.forEach((bits) => {
    const option = el('option', undefined, `${bits} bits`);
    option.value = String(bits);
    option.selected = bits === state.hashBits;
    sizeSelect.appendChild(option);
  });

  const actions = el('div', 'analyzer-actions');
  const sampleButton = el('button', undefined, 'Load sample text');
  const randomButton = el('button', undefined, 'Load random bytes');
  const clearButton = el('button', undefined, 'Clear');
  [sampleButton, randomButton, clearButton].forEach((b) => {
    b.type = 'button';
    actions.appendChild(b);
  });

  controls.append(textLabel, textarea, hint, fileLabel, fileInput, sizeLabel, sizeSelect, actions);
  root.appendChild(controls);

  // Results
  const results = el('div', 'analyzer-results');
  results.setAttribute('aria-live', 'polite');
  root.appendChild(results);

  container.replaceChildren(root);

  // ----- behaviour -----

  function refresh() {
    renderResults(results, analyzeBytes(state.bytes, state.hashBits), state);
  }

  function setBytes(bytes, source) {
    state.bytes = bytes;
    state.source = source;
    refresh();
  }

  textarea.addEventListener('input', () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      fileInput.value = '';
      setBytes(textToBytes(textarea.value), 'pasted text');
    }, DEBOUNCE_MS);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('That file is larger than 5 MB. Please choose a smaller file.');
      fileInput.value = '';
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      textarea.value = '';
      setBytes(bytes, `file "${file.name}"`);
    } catch (err) {
      toast.error(err);
    }
  });

  sampleButton.addEventListener('click', async () => {
    let text = SAMPLE_FALLBACK;
    try {
      const response = await fetch(SAMPLE_PATH);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } catch {
      toast.info('Sample file not found, using the built-in sample paragraph.');
    }
    fileInput.value = '';
    textarea.value = text;
    setBytes(textToBytes(textarea.value), 'sample English text');
  });

  randomButton.addEventListener('click', () => {
    const bytes = new Uint8Array(RANDOM_BYTE_COUNT);
    crypto.getRandomValues(bytes);
    fileInput.value = '';
    textarea.value = '';
    setBytes(bytes, `${RANDOM_BYTE_COUNT} random bytes`);
  });

  clearButton.addEventListener('click', () => {
    clearTimeout(debounceId);
    fileInput.value = '';
    textarea.value = '';
    setBytes(new Uint8Array(0), '');
  });

  sizeSelect.addEventListener('change', () => {
    state.hashBits = Number(sizeSelect.value);
    refresh();
  });

  refresh(); // draws the empty state

  return function cleanup() {
    clearTimeout(debounceId);
  };
}