/**
 * ============================================================================
 *  File    : js/ui/visualizerView.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Hash Visualizer view (proves Slides 2, 3, 6, 8, 9)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  The screen for Module 1. It animates, one stage at a time, how a message
 *  becomes a hash, so the audience can SEE the algorithms from the slides:
 *
 *      text -> ASCII codes -> binary -> padding -> blocks -> hashing -> hash
 *
 *  THE STAGES (each one appears below the previous one)
 *  ----------------------------------------------------
 *  1. Text          the message and how many characters / bytes it has.
 *  2. ASCII codes   a table: byte, character, decimal code, hex (Slide 3).
 *  3. Binary        every byte as 8 coloured bit cells.
 *  4. Padding       the Slide 2 diagram:  | M | padding bits | length of M |
 *                   drawn as three labelled boxes (the length box only if the
 *                   "append length" option is on).
 *  5. Blocks        the padded message cut into n-bit blocks B1, B2, ...
 *  6. Hashing       ONE card per block, replaced as the animation advances:
 *                     XOR  (Slide 6):  new = running ^ block
 *                     RXOR (Slide 8):  rotated = ROL1(running);
 *                                      new = rotated ^ block
 *                   Bits flipped by the block are highlighted.
 *  7. Final hash    a hash card (hex, binary, copy button).
 *
 *  ALGORITHM CHOICE
 *  ----------------
 *    XOR            only the XOR hash.
 *    RXOR           only the RXOR hash.
 *    Both           SIDE BY SIDE: stages 6 and 7 show two columns, XOR on the
 *                   left and RXOR on the right, for the same blocks (Slide 9).
 *
 *  CONTROLS
 *  --------
 *    Reset / Back / Play (Pause) / Step / Skip to end, a speed selector
 *    (slow / normal / fast from config.js), the message box, the block size,
 *    the algorithm choice, and an "append the length of M" checkbox.
 *  Tip shown on screen: block size 8 bits and the message HI reproduces the
 *  slide example (01001000 ^ 01001001 = 00000001).
 *
 *  All calculation is done by core/. This file only collects input and draws
 *  the result.
 *
 *  WHAT I IMPLEMENTED (exported function)
 *  --------------------------------------
 *  renderVisualizerView(container) -> cleanup function
 *     Builds the whole view inside `container` (the empty #view element given
 *     by router.js) and returns a cleanup function that stops the play timer
 *     and any pending debounce, so nothing keeps running after the user
 *     leaves the page. router.js must call it before showing another view
 *     (same contract as the other view files).
 *
 *  HOW THE ANIMATION WORKS
 *  -----------------------
 *  The run is a list of FRAMES: 5 setup frames (stages 1 to 5), one frame per
 *  block (stage 6), and one final frame (stage 7). A frame number of -1 means
 *  "nothing shown yet".
 *    - Moving forward by one frame ADDS the new stage below, with the enter
 *      animation, so the audience watches the pipeline grow.
 *    - Moving backward, jumping, or resetting rebuilds the page up to that
 *      frame at once, without the enter animation.
 *    - The newest stage gets the class .viz-current and is scrolled into view
 *      when moving forward.
 *
 *  BEHAVIOUR NOTES
 *  ---------------
 *  - Changing the message, block size, algorithm, or the length option stops
 *    playing and starts over (the old frames would be out of date). Changing
 *    only the speed does not. Typing is debounced (150 ms).
 *  - Pressing Play at the end restarts from the beginning.
 *  - An empty message disables the controls and shows a hint.
 *  - The status line ("Step 7 of 18: ...") is a polite live region while the
 *    user steps by hand. While the animation PLAYS it is switched to
 *    aria-live="off" so a screen reader is not interrupted every step.
 *  - A progress bar shows how far through the frames the animation is.
 *  - Long messages are trimmed in the display only: the ASCII table and bit
 *    grids show at most 64 bytes, the block list at most 16 blocks. The
 *    hash itself is always calculated on the whole message.
 *  - With a single block, XOR and RXOR give the same hash (rotating zero
 *    changes nothing); a note explains it in Both mode.
 *  - Smooth scrolling is turned off when the user prefers reduced motion.
 *  - Everything is built with createElement/textContent (no innerHTML), so
 *    text typed by the user can never inject HTML.
 *
 *  ASSUMPTIONS ABOUT YOUR OTHER FILES (please check)
 *  -------------------------------------------------
 *    - xorHashSteps / rxorHashSteps(bytes, blockBytes, appendLength) return
 *      { blocks, steps, hash } with steps[i] = { index, block, previous,
 *      [rotated for RXOR], result }, exactly as their headers describe.
 *    - padding.js exports paddingNeeded(length, blockBytes) and
 *      padToBlockSize(bytes, blockBytes, appendLength). The three segments
 *      (message, padding, length) are worked out HERE from those two calls:
 *      message = first `length` bytes, padding = the next paddingNeeded()
 *      bytes, length field = whatever remains. So no guessed field names.
 *    - config.js exports DEFAULT_BLOCK_BYTES, ALLOWED_BLOCK_BYTES,
 *      ANIMATION_SPEEDS, DEFAULT_ANIMATION_SPEED and getStepDelay(speed).
 *    - renderBitGrid accepts { bytesPerRow, showValues, showHex,
 *      showBitPositions, highlightChanged, maxBytes, label } and
 *      renderHashCard accepts { title, hash, state, statusText }.
 *
 *  CSS CLASSES (style them in css/components.css, animate in animations.css)
 *  -------------------------------------------------------------------------
 *    .visualizer-view  .viz-intro  .viz-controls  .field  .field-label
 *    .field-check  .viz-buttons  .viz-progress  .viz-status  .viz-tip
 *    .viz-pipeline  .viz-empty
 *    .viz-panel  (.viz-enter  .viz-current)  .viz-panel-note  .viz-panel-body
 *    .viz-message  .viz-info  .viz-table  .viz-segments
 *    .viz-segment (.viz-seg-message  .viz-seg-padding  .viz-seg-length)
 *    .viz-segment-label  .viz-blocks  .viz-block  .viz-columns  .viz-column
 *    .viz-row  .viz-row-label  .viz-step-enter  .viz-final  .viz-note
 *  Use .viz-enter / .viz-step-enter for the fade or slide-in, and the colours
 *  of .viz-seg-* to match the three colours of the Slide 2 diagram.
 *
 *  USED BY : js/ui/router.js (route #/visualizer)
 *  DEPENDS : core/config.js, core/bitUtils.js, core/padding.js,
 *            core/xorHash.js, core/rxorHash.js, ui/components/bitGrid.js,
 *            ui/components/hashCard.js, ui/components/toast.js
 * ============================================================================
 */

import {
  DEFAULT_BLOCK_BYTES,
  ALLOWED_BLOCK_BYTES,
  ANIMATION_SPEEDS,
  DEFAULT_ANIMATION_SPEED,
  getStepDelay,
} from '../core/config.js';
import { textToBytes } from '../core/bitUtils.js';
import { paddingNeeded, padToBlockSize } from '../core/padding.js';
import { xorHashSteps } from '../core/xorHash.js';
import { rxorHashSteps } from '../core/rxorHash.js';
import { renderBitGrid } from './components/bitGrid.js';
import { renderHashCard } from './components/hashCard.js';
import { toast } from './components/toast.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGE = 'HELLO WORLD';
const MAX_MESSAGE_CHARS = 64;
const DEBOUNCE_MS = 150;
const MAX_DISPLAY_BYTES = 64;
const MAX_DISPLAY_BLOCKS = 16;
const MAX_BYTES_PER_ROW = 8;
const SETUP_FRAMES = 5; // text, ASCII, binary, padding, blocks

const ALGO_XOR = 'XOR';
const ALGO_RXOR = 'RXOR';
const ALGO_BOTH = 'BOTH';

// ---------------------------------------------------------------------------
// Small helpers (pure, no state)
// ---------------------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(label, className = 'btn') {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

function makeField(labelText, control) {
  const wrap = el('label', 'field');
  wrap.append(el('span', 'field-label', labelText), control);
  return wrap;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** What to show in the "Character" column of the ASCII table. */
function characterLabel(b) {
  if (b === 32) return '(space)';
  if (b > 32 && b < 127) return String.fromCharCode(b);
  if (b < 32 || b === 127) return '(control)';
  return '(UTF-8 byte)';
}

/** Which algorithms to draw, in left-to-right order. */
function algorithmsFor(choice) {
  if (choice === ALGO_BOTH) return [ALGO_XOR, ALGO_RXOR];
  return [choice];
}

/** Runs all the core calculations for one message. Returns null if empty. */
function compute(text, blockBytes, appendLength) {
  const bytes = textToBytes(text);
  if (bytes.length === 0) return null;

  const xor = xorHashSteps(bytes, blockBytes, appendLength);
  const rxor = rxorHashSteps(bytes, blockBytes, appendLength);
  const padded = padToBlockSize(bytes, blockBytes, appendLength);
  const padBytes = paddingNeeded(bytes.length, blockBytes);
  const lengthBytes = Math.max(0, padded.length - bytes.length - padBytes);

  return {
    text,
    bytes,
    blockBytes,
    appendLength,
    padded,
    padBytes,
    lengthBytes,
    xor,
    rxor,
    blockCount: xor.blocks.length,
  };
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function renderVisualizerView(container) {
  // ----- lifetime guards -----
  let alive = true;
  let debounceId = null;
  let timerId = null;

  // ----- state -----
  const state = {
    data: null, // result of compute(), or null for an empty message
    frame: -1, // -1 = nothing shown yet
    playing: false,
  };

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================================
  // Build the static DOM
  // =========================================================================

  const root = el('section', 'visualizer-view');

  const title = el('h2', null, 'Hash Visualizer');
  const intro = el(
    'p',
    'viz-intro',
    'Watch a message travel through the pipeline: text, ASCII codes, binary, padding, blocks, and finally ' +
      'the XOR or RXOR hash. Choose "Both" to see them side by side.',
  );

  // ----- controls -----
  const controls = el('div', 'viz-controls');

  const messageInput = el('input');
  messageInput.type = 'text';
  messageInput.value = DEFAULT_MESSAGE;
  messageInput.maxLength = MAX_MESSAGE_CHARS;
  messageInput.autocomplete = 'off';
  messageInput.spellcheck = false;

  const blockSelect = el('select');
  for (const bytes of ALLOWED_BLOCK_BYTES) {
    const opt = el('option', null, `${bytes * 8} bits (${plural(bytes, 'byte')})`);
    opt.value = String(bytes);
    if (bytes === DEFAULT_BLOCK_BYTES) opt.selected = true;
    blockSelect.append(opt);
  }

  const algoSelect = el('select');
  for (const [value, label] of [
    [ALGO_XOR, 'XOR'],
    [ALGO_RXOR, 'RXOR'],
    [ALGO_BOTH, 'Both, side by side'],
  ]) {
    const opt = el('option', null, label);
    opt.value = value;
    algoSelect.append(opt);
  }

  const speedSelect = el('select');
  for (const [name, ms] of Object.entries(ANIMATION_SPEEDS)) {
    const opt = el('option', null, `${capitalise(name)} (${ms} ms per step)`);
    opt.value = name;
    if (name === DEFAULT_ANIMATION_SPEED) opt.selected = true;
    speedSelect.append(opt);
  }

  const lengthCheckbox = el('input');
  lengthCheckbox.type = 'checkbox';
  const lengthField = el('label', 'field field-check');
  lengthField.append(lengthCheckbox, el('span', 'field-label', 'Append the length of M (Slide 2)'));

  controls.append(
    makeField('Message', messageInput),
    makeField('Block size', blockSelect),
    makeField('Algorithm', algoSelect),
    makeField('Speed', speedSelect),
    lengthField,
  );

  // ----- play controls -----
  const buttons = el('div', 'viz-buttons');
  const resetBtn = makeButton('Reset', 'btn btn-secondary');
  const backBtn = makeButton('Back', 'btn btn-secondary');
  const playBtn = makeButton('Play');
  const stepBtn = makeButton('Step');
  const skipBtn = makeButton('Skip to end', 'btn btn-secondary');
  buttons.append(resetBtn, backBtn, playBtn, stepBtn, skipBtn);

  const progress = el('progress', 'viz-progress');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', 'Animation progress');

  const statusLine = el('p', 'viz-status');
  statusLine.setAttribute('role', 'status');
  statusLine.setAttribute('aria-live', 'polite');

  const tip = el(
    'p',
    'viz-tip',
    'Tip: choose a block size of 8 bits and type HI to reproduce the slide example ' +
      '(01001000 ^ 01001001 = 00000001).',
  );

  const pipeline = el('div', 'viz-pipeline');

  root.append(title, intro, controls, buttons, progress, statusLine, tip, pipeline);
  container.replaceChildren(root);

  // =========================================================================
  // Frame bookkeeping
  // =========================================================================

  let hashPanel = null; // { root, heading, body } of stage 6, if on screen
  let currentPanel = null;

  function totalFrames() {
    return state.data ? SETUP_FRAMES + state.data.blockCount + 1 : 0;
  }

  function describeFrame(f) {
    const data = state.data;
    if (!data) return '';
    if (f < 0) return 'Ready. Press Play or Step to begin.';
    const stepText = `Step ${f + 1} of ${totalFrames()}`;
    const names = algorithmsFor(algoSelect.value).join(' and ');
    switch (f) {
      case 0:
        return `${stepText}: the message text.`;
      case 1:
        return `${stepText}: every byte of the text has an ASCII code.`;
      case 2:
        return `${stepText}: the same bytes written in binary.`;
      case 3:
        return `${stepText}: padding makes the message a whole number of blocks.`;
      case 4:
        return `${stepText}: the padded message is cut into ${plural(data.blockCount, 'block')}.`;
      default:
        break;
    }
    const hashIndex = f - SETUP_FRAMES;
    if (hashIndex < data.blockCount) {
      return `${stepText}: ${names}, block ${hashIndex + 1} of ${data.blockCount}.`;
    }
    return `${stepText}: the final hash.`;
  }

  // =========================================================================
  // Stage builders (each returns { root, heading, body })
  // =========================================================================

  function makePanel(headingText, noteText, animate) {
    const panel = el('section', 'viz-panel');
    if (animate) panel.classList.add('viz-enter');
    const heading = el('h3', null, headingText);
    panel.append(heading);
    if (noteText) panel.append(el('p', 'viz-panel-note', noteText));
    const body = el('div', 'viz-panel-body');
    panel.append(body);
    return { root: panel, heading, body };
  }

  function rowBytes(blockBytes) {
    return Math.min(blockBytes, MAX_BYTES_PER_ROW);
  }

  function gridOptions(label, extra = {}) {
    return {
      bytesPerRow: rowBytes(state.data.blockBytes),
      showHex: true,
      label,
      ...extra,
    };
  }

  // ----- 1. text -----
  function buildTextPanel(animate) {
    const { bytes, text } = state.data;
    const chars = Array.from(text).length;
    const panel = makePanel('1. Text', 'This is the message M that we want to hash.', animate);
    panel.body.append(
      el('p', 'viz-message', text),
      el('p', 'viz-info', `${plural(chars, 'character')}, ${plural(bytes.length, 'byte')}.`),
    );
    if (bytes.length > chars) {
      panel.body.append(
        el(
          'p',
          'viz-note',
          'Some characters need more than one byte in UTF-8, so there are more bytes than characters.',
        ),
      );
    }
    return panel;
  }

  // ----- 2. ASCII table -----
  function buildAsciiPanel(animate) {
    const { bytes } = state.data;
    const panel = makePanel(
      '2. ASCII codes',
      'Each byte of the message is a number. Plain English letters are ASCII codes below 128.',
      animate,
    );

    const table = el('table', 'viz-table');
    table.append(el('caption', null, 'Each byte of the message'));
    const thead = el('thead');
    const headRow = el('tr');
    for (const name of ['Byte', 'Character', 'Decimal', 'Hex']) {
      const th = el('th', null, name);
      th.scope = 'col';
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = el('tbody');
    const shown = Math.min(bytes.length, MAX_DISPLAY_BYTES);
    for (let i = 0; i < shown; i += 1) {
      const b = bytes[i];
      const tr = el('tr');
      tr.append(
        el('td', null, String(i + 1)),
        el('td', null, characterLabel(b)),
        el('td', null, String(b)),
        el('td', null, b.toString(16).padStart(2, '0')),
      );
      tbody.append(tr);
    }
    table.append(tbody);
    panel.body.append(table);

    if (bytes.length > shown) {
      panel.body.append(el('p', 'viz-note', `... ${bytes.length - shown} more bytes not shown.`));
    }
    return panel;
  }

  // ----- 3. binary -----
  function buildBinaryPanel(animate) {
    const { bytes } = state.data;
    const panel = makePanel(
      '3. Binary',
      'Every byte becomes 8 bits. The leftmost bit (bit 7) of plain ASCII text is always 0.',
      animate,
    );
    panel.body.append(
      renderBitGrid(bytes, {
        bytesPerRow: 4,
        showHex: true,
        showBitPositions: true,
        maxBytes: MAX_DISPLAY_BYTES,
        label: 'Binary of the message',
      }),
    );
    return panel;
  }

  // ----- 4. padding -----
  function buildPaddingPanel(animate) {
    const { bytes, padded, padBytes, lengthBytes, blockBytes } = state.data;
    const panel = makePanel(
      '4. Padding',
      'A hash works on whole blocks, so the message is padded with zero bits up to the next block boundary.',
      animate,
    );

    const messageEnd = bytes.length;
    const paddingEnd = bytes.length + padBytes;
    const segments = [
      { cls: 'viz-seg-message', label: 'M (message)', slice: padded.slice(0, messageEnd) },
      { cls: 'viz-seg-padding', label: 'Padding bits', slice: padded.slice(messageEnd, paddingEnd) },
      { cls: 'viz-seg-length', label: 'Length of M (in bits)', slice: padded.slice(paddingEnd) },
    ];

    const row = el('div', 'viz-segments');
    for (const seg of segments) {
      if (seg.slice.length === 0) continue;
      const box = el('div', `viz-segment ${seg.cls}`);
      box.append(
        el('h4', 'viz-segment-label', `${seg.label}: ${plural(seg.slice.length, 'byte')}`),
        renderBitGrid(seg.slice, {
          bytesPerRow: rowBytes(blockBytes),
          showHex: true,
          maxBytes: MAX_DISPLAY_BYTES,
          label: seg.label,
        }),
      );
      row.append(box);
    }
    panel.body.append(row);

    const summary =
      padBytes === 0
        ? `The message is already ${plural(bytes.length / blockBytes, 'whole block')} long, so no padding is needed.`
        : `${plural(bytes.length, 'byte')} of message + ${plural(padBytes, 'byte')} of padding = ` +
          `${plural(bytes.length + padBytes, 'byte')}, a multiple of the ${plural(blockBytes, 'byte')} block size.`;
    panel.body.append(el('p', 'viz-info', summary));
    if (lengthBytes > 0) {
      panel.body.append(
        el(
          'p',
          'viz-note',
          `A ${plural(lengthBytes, 'byte')} length field was added after the padding, as in Slide 2.`,
        ),
      );
    }
    return panel;
  }

  // ----- 5. blocks -----
  function buildBlocksPanel(animate) {
    const { xor, blockBytes, blockCount } = state.data;
    const panel = makePanel(
      '5. Blocks',
      `The padded message is cut into ${plural(blockCount, 'block')} of ${blockBytes * 8} bits: B1, B2, ...`,
      animate,
    );

    const list = el('div', 'viz-blocks');
    const shown = Math.min(blockCount, MAX_DISPLAY_BLOCKS);
    for (let k = 0; k < shown; k += 1) {
      const card = el('div', 'viz-block');
      card.append(
        el('h4', null, `B${k + 1}`),
        renderBitGrid(xor.blocks[k], gridOptions(`Block ${k + 1}`)),
      );
      list.append(card);
    }
    panel.body.append(list);
    if (blockCount > shown) {
      panel.body.append(el('p', 'viz-note', `... ${blockCount - shown} more blocks not shown.`));
    }
    return panel;
  }

  // ----- 6. hashing (one card per block) -----
  function buildStepRow(labelText, bytes, extra) {
    const row = el('div', 'viz-row');
    row.append(el('h5', 'viz-row-label', labelText), renderBitGrid(bytes, gridOptions(labelText, extra)));
    return row;
  }

  function buildStepColumn(name, k) {
    const data = state.data;
    const run = name === ALGO_XOR ? data.xor : data.rxor;
    const step = run.steps[k];
    const column = el('div', 'viz-column');
    column.append(el('h4', null, name));

    column.append(buildStepRow('Running hash before', step.previous));
    if (name === ALGO_RXOR) {
      column.append(buildStepRow('Rotated left by 1 bit: ROL1(running hash)', step.rotated));
    }
    column.append(buildStepRow(`Block B${k + 1}`, step.block));
    column.append(
      el(
        'p',
        'viz-info',
        name === ALGO_XOR ? 'New hash = running hash ^ block' : 'New hash = ROL1(running hash) ^ block',
      ),
    );
    column.append(
      buildStepRow('New running hash (flipped bits highlighted)', step.result, {
        highlightChanged: step.block,
      }),
    );
    return column;
  }

  function buildStepBody(k) {
    const wrap = el('div', 'viz-columns');
    for (const name of algorithmsFor(algoSelect.value)) {
      wrap.append(buildStepColumn(name, k));
    }
    return wrap;
  }

  function hashHeading(k) {
    return `6. Hashing: block ${k + 1} of ${state.data.blockCount}`;
  }

  // ----- 7. final hash -----
  function buildFinalPanel(animate) {
    const { xor, rxor } = state.data;
    const names = algorithmsFor(algoSelect.value);
    const panel = makePanel('7. Final hash', 'The last running value is the hash of the message.', animate);

    const wrap = el('div', 'viz-columns viz-final');
    for (const name of names) {
      const column = el('div', 'viz-column');
      const run = name === ALGO_XOR ? xor : rxor;
      column.append(renderHashCard({ title: `${name} hash`, hash: run.hash }));
      column.append(
        el(
          'p',
          'viz-note',
          name === ALGO_XOR
            ? 'Swap any two blocks and this hash stays the same: order does not matter.'
            : 'Order matters now, but one correcting block can still force any hash.',
        ),
      );
      wrap.append(column);
    }
    panel.body.append(wrap);

    if (names.length === 2) {
      const same = bytesEqual(xor.hash, rxor.hash);
      panel.body.append(
        el(
          'p',
          'viz-note',
          same
            ? 'The two hashes happen to be equal here. With a single block this always happens, because rotating ' +
                'a zero hash changes nothing.'
            : 'Same message, same blocks, different hashes: the rotation makes the order of blocks matter.',
        ),
      );
    }
    return panel;
  }

  // =========================================================================
  // Rendering frames
  // =========================================================================

  function markCurrent(panelRoot) {
    if (currentPanel && currentPanel !== panelRoot) currentPanel.classList.remove('viz-current');
    currentPanel = panelRoot;
    if (panelRoot) panelRoot.classList.add('viz-current');
  }

  /** Adds (or updates) the stage for frame f. Returns the panel that changed. */
  function addFrame(f, animate) {
    const data = state.data;
    if (f < SETUP_FRAMES) {
      const builders = [buildTextPanel, buildAsciiPanel, buildBinaryPanel, buildPaddingPanel, buildBlocksPanel];
      const panel = builders[f](animate);
      pipeline.append(panel.root);
      return panel.root;
    }

    const hashIndex = f - SETUP_FRAMES;
    if (hashIndex < data.blockCount) {
      const body = buildStepBody(hashIndex);
      if (!hashPanel) {
        const panel = makePanel(hashHeading(hashIndex), null, animate);
        panel.body.append(body);
        pipeline.append(panel.root);
        hashPanel = panel;
      } else {
        hashPanel.heading.textContent = hashHeading(hashIndex);
        hashPanel.body.replaceChildren(body);
      }
      if (animate) {
        body.classList.add('viz-step-enter');
      }
      return hashPanel.root;
    }

    const panel = buildFinalPanel(animate);
    pipeline.append(panel.root);
    return panel.root;
  }

  function showEmptyPipeline(message) {
    hashPanel = null;
    currentPanel = null;
    pipeline.replaceChildren(el('p', 'viz-empty', message));
  }

  /** Moves the picture from state.frame to `target`. */
  function renderTo(target) {
    const previous = state.frame;

    if (target < 0) {
      showEmptyPipeline('Press Play to watch the message turn into a hash, or Step to go one stage at a time.');
      return;
    }

    let changed;
    if (target === previous + 1 && previous >= 0) {
      // Forward by one: add the new stage with its enter animation.
      changed = addFrame(target, true);
      markCurrent(changed);
      changed.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    } else {
      // Anything else: rebuild up to the target at once, with no animation.
      pipeline.replaceChildren();
      hashPanel = null;
      currentPanel = null;
      for (let f = 0; f <= target; f += 1) changed = addFrame(f, false);
      markCurrent(changed);
    }
  }

  // =========================================================================
  // Controls and state
  // =========================================================================

  function syncControls() {
    const total = totalFrames();
    const has = total > 0;

    resetBtn.disabled = !has || state.frame < 0;
    backBtn.disabled = !has || state.frame < 0;
    stepBtn.disabled = !has || state.frame >= total - 1;
    skipBtn.disabled = !has || state.frame >= total - 1;
    playBtn.disabled = !has;
    playBtn.textContent = state.playing ? 'Pause' : 'Play';

    progress.max = Math.max(total, 1);
    progress.value = Math.max(state.frame + 1, 0);

    statusLine.setAttribute('aria-live', state.playing ? 'off' : 'polite');
    statusLine.textContent = has ? describeFrame(state.frame) : 'Type a message to begin.';
  }

  function goTo(target) {
    const total = totalFrames();
    if (total === 0) return;
    const clamped = Math.max(-1, Math.min(total - 1, target));
    if (clamped === state.frame) return;
    renderTo(clamped);
    state.frame = clamped;
    syncControls();
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function pause() {
    clearTimer();
    state.playing = false;
    syncControls();
  }

  function scheduleTick() {
    clearTimer();
    timerId = setTimeout(() => {
      timerId = null;
      if (!alive || !state.playing) return;
      goTo(state.frame + 1);
      if (state.frame >= totalFrames() - 1) {
        pause();
        return;
      }
      scheduleTick();
    }, getStepDelay(speedSelect.value));
  }

  function play() {
    if (state.playing || totalFrames() === 0) return;
    if (state.frame >= totalFrames() - 1) goTo(-1);
    state.playing = true;
    goTo(state.frame + 1);
    if (state.frame >= totalFrames() - 1) {
      pause();
      return;
    }
    syncControls();
    scheduleTick();
  }

  /** Recomputes everything for the current inputs and starts over. */
  function rebuild() {
    pause();
    state.frame = -1;
    try {
      state.data = compute(
        messageInput.value,
        Number(blockSelect.value),
        lengthCheckbox.checked,
      );
    } catch (err) {
      state.data = null;
      toast.error(err);
    }
    if (state.data) {
      showEmptyPipeline('Press Play to watch the message turn into a hash, or Step to go one stage at a time.');
    } else {
      showEmptyPipeline('Type a message to see how it is hashed.');
    }
    syncControls();
  }

  // =========================================================================
  // Wiring
  // =========================================================================

  playBtn.addEventListener('click', () => {
    if (state.playing) pause();
    else play();
  });
  stepBtn.addEventListener('click', () => {
    pause();
    goTo(state.frame + 1);
  });
  backBtn.addEventListener('click', () => {
    pause();
    goTo(state.frame - 1);
  });
  resetBtn.addEventListener('click', () => {
    pause();
    goTo(-1);
  });
  skipBtn.addEventListener('click', () => {
    pause();
    goTo(totalFrames() - 1);
  });

  messageInput.addEventListener('input', () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      if (alive) rebuild();
    }, DEBOUNCE_MS);
  });
  blockSelect.addEventListener('change', rebuild);
  algoSelect.addEventListener('change', rebuild);
  lengthCheckbox.addEventListener('change', rebuild);
  // The speed selector needs no rebuild: the next tick reads the new value.

  // ----- first paint -----
  rebuild();

  // =========================================================================
  // Cleanup (called by router.js before another view is shown)
  // =========================================================================

  return function cleanup() {
    alive = false;
    state.playing = false;
    clearTimer();
    clearTimeout(debounceId);
  };
}