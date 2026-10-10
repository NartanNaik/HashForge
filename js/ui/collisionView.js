/**
 * ============================================================================
 *  File    : js/ui/collisionView.js
 *  Project : Hash Forge (NIE Mysuru, Dept. of CSE, Batch 09)
 *  Module  : Collision and Avalanche Lab view (proves Slides 7 and 9)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  The screen for Module 4. It has two sections that turn the theory into
 *  something the audience can click:
 *
 *  SECTION 1: COLLISION RACE
 *    The user types a message. The view then shows how differently the three
 *    hash functions behave when we look for a COLLISION (two different
 *    messages, same hash):
 *      - XOR      : instant, by swapping two blocks.
 *      - RXOR     : instant, by appending one correcting block.
 *      - SHA-256  : only possible on a TRUNCATED version (8 to 32 bits) with a
 *                   brute-force birthday search whose work grows like
 *                   2^(bits/2). Full 256-bit SHA-256 would need about 2^128.
 *    Three "lanes" run side by side with live attempt counters and timers.
 *    A separate "size sweep" runs 8, 16, 24 and 32 bits and draws the
 *    attempts-vs-size chart (measured bars vs the birthday bound line).
 *    The two buttons "Find XOR collision" / "Find RXOR collision" show the
 *    actual pair of messages, both hashes (match state) and, for contrast,
 *    the SHA-256 of the same two messages (completely different).
 *
 *  SECTION 2: AVALANCHE TEST
 *    The input message is drawn as a clickable bit grid. Clicking a bit flips
 *    it, and the view shows the XOR, RXOR and SHA-256 hashes AFTER the flip
 *    with the changed output bits highlighted:
 *      - XOR and RXOR change exactly 1 bit (rotation only moves it),
 *      - SHA-256 changes about half of its 256 bits.
 *    "Flip random bit" does the same on a random position. "Run N trials"
 *    averages many random flips and draws the bar chart (XOR vs RXOR vs
 *    SHA-256, % of output bits changed).
 *
 *  All calculation is done by core/, attacks/ and charts/. This file only
 *  collects input and draws the result.
 *
 *  WHAT I IMPLEMENTED (exported function)
 *  --------------------------------------
 *  renderCollisionView(container) -> cleanup function
 *     Builds the whole view inside `container` (the empty #view element given
 *     by router.js) and returns a cleanup function. Cleanup cancels any
 *     running birthday search (AbortController), stops all live timers, drops
 *     pending debounced work and destroys both charts. router.js must call it
 *     before showing another view (same contract as analyzerView.js).
 *
 *  CONTROLS AT THE TOP (shared by both sections)
 *    - Message          text input (UTF-8 via textToBytes), default demo text.
 *    - Other message    OPTIONAL, used only by "Find RXOR collision": the
 *                       forged message that gets the correcting block. If
 *                       empty, collision.js uses the original with its first
 *                       bit flipped.
 *    - Block size       from ALLOWED_BLOCK_BYTES (default 2 bytes = 16 bits).
 *                       This is also the XOR / RXOR hash width.
 *
 *  BEHAVIOUR NOTES
 *  ---------------
 *  - Changing the message or block size clears the old results (they would
 *    be out of date). Typing is debounced (150 ms).
 *  - Every error is shown with toast.error(err), including the ones thrown by
 *    collision.js / avalanche.js (for example "Need at least two different
 *    blocks to swap.").
 *  - While a birthday search runs, Start / Sweep are disabled and Cancel is
 *    enabled. A cancelled run shows "Cancelled", not an error.
 *  - Async results that arrive after the user left the page, or after a newer
 *    click, are ignored (alive flag and run tokens), so nothing is drawn into
 *    a view that no longer exists.
 *  - The input bit grid shows at most 32 bytes (256 bits) so it stays
 *    readable on a projector; the message itself can be longer.
 *  - After clicking a bit, keyboard focus returns to that bit so the grid is
 *    usable without a mouse.
 *  - The RXOR collision message contains a correcting block of arbitrary
 *    bytes, so some characters show as "." in the text preview. The hex line
 *    always shows the exact bytes (the honest limitation of the project).
 *  - Everything is built with createElement/textContent (no innerHTML), so
 *    text typed by the user can never inject HTML.
 *
 *  ASSUMPTIONS ABOUT YOUR OTHER FILES (please check)
 *  -------------------------------------------------
 *  I wrote this against the header comments of your files, not their code.
 *  Where a header did not name an exact field, I gathered the guesses in ONE
 *  object, RESULT_FIELDS, near the top of this file. If something shows
 *  "unexpected shape" in a toast, fix the names there and nothing else.
 *    - xorBlockSwapCollision(msg, blockBytes) returns the new message under
 *      one of the names listed in RESULT_FIELDS.xorMessage.
 *    - rxorCollision(msg, blockBytes, otherBytes) returns the new message
 *      under RESULT_FIELDS.rxorMessage (finalMessage, like forgeRxor).
 *    - avalancheTest(...) returns one entry per algorithm (names in
 *      RESULT_FIELDS.algorithms), each with before / after hashes and
 *      optionally a diff mask. Changed-bit counts and percentages are
 *      recomputed here from the hashes, so they cannot disagree with the
 *      bit grid.
 *    - birthdayCollisionSha(bits, { signal, onProgress }) and
 *      birthdaySweep(bitsList, { signal, onProgress }) accept an AbortSignal
 *      and a progress callback called with a number of attempts or an object
 *      with `attempts` (and optionally `bits`). Results have found, attempts,
 *      expectedAttempts and elapsedMs, as charts.js expects.
 *    - xorHash / rxorHash are synchronous and use zero padding with no length
 *      block (the default), so hashes shown here equal the ones collision.js
 *      reasoned about.
 *    - The hash shown for a message is recomputed here with the real
 *      xorHash() / rxorHash(), never trusted from the attack result, so a
 *      wrong collision can never be displayed as a success.
 *
 *  CSS CLASSES (style them in css/components.css and css/layout.css)
 *  -----------------------------------------------------------------
 *    .collision-view  .collision-intro  .collision-controls  .field
 *    .field-label  .collision-section  .collision-hint  .collision-actions
 *    .collision-empty  .collision-panel  .collision-panel-title
 *    .collision-messages  .message-box  .message-preview  .message-hex
 *    .message-len  .collision-hashes  .collision-status  .collision-warning
 *    .collision-note  .collision-sha  .race-lanes  .race-lane (data-state:
 *    idle | running | done | error | cancelled)  .race-lane-title
 *    .race-lane-sub  .race-lane-status  .race-lane-attempts  .race-lane-time
 *    .race-note  .sweep-progress  .sweep-summary  .chart-box
 *    .avalanche-input  .avalanche-flipped  .avalanche-results
 *    .avalanche-cards  .avalanche-col  .avalanche-before  .avalanche-count
 *    .avalanche-verdict  .avalanche-summary
 *  The chart boxes get an inline height (300 px) because Chart.js needs a
 *  sized parent to draw in; override it in CSS if you prefer.
 *
 *  USED BY : js/ui/router.js (route #/collision)
 *  DEPENDS : core/config.js, core/bitUtils.js, core/xorHash.js,
 *            core/rxorHash.js, core/sha256.js, attacks/collision.js,
 *            attacks/avalanche.js, charts/charts.js,
 *            ui/components/bitGrid.js, ui/components/hashCard.js,
 *            ui/components/toast.js
 * ============================================================================
 */

import {
  DEFAULT_BLOCK_BYTES,
  ALLOWED_BLOCK_BYTES,
  BIRTHDAY_SHA_BITS,
  AVALANCHE_TRIALS,
} from '../core/config.js';
import { textToBytes, bytesToHex, xorBytes, countSetBits } from '../core/bitUtils.js';
import { xorHash } from '../core/xorHash.js';
import { rxorHash } from '../core/rxorHash.js';
import { sha256 } from '../core/sha256.js';
import {
  xorBlockSwapCollision,
  rxorCollision,
  birthdayCollisionSha,
  birthdaySweep,
} from '../attacks/collision.js';
import { avalancheTest, avalancheBatch, toChartData } from '../attacks/avalanche.js';
import { renderAvalancheChart, renderCollisionChart, destroyChart } from '../charts/charts.js';
import { renderBitGrid } from './components/bitGrid.js';
import { renderHashCard } from './components/hashCard.js';
import { toast } from './components/toast.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGE = 'Pay Rs 100 to Ravi today';
const MAX_MESSAGE_CHARS = 128;
const INPUT_GRID_MAX_BYTES = 32;
const DEBOUNCE_MS = 150;
const TICK_MS = 50;
const DEFAULT_BIRTHDAY_BITS = 16;

/**
 * The ONLY place that knows the field names returned by attacks/*.js.
 * Each list is tried in order; the first name that exists is used.
 */
const RESULT_FIELDS = {
  xorMessage: ['swappedMessage', 'collidingMessage', 'newMessage', 'swapped', 'message'],
  rxorMessage: ['collidingMessage', 'finalMessage', 'newMessage', 'message'],
  algorithms: {
    xor: ['xor', 'XOR'],
    rxor: ['rxor', 'RXOR'],
    sha: ['sha256', 'sha', 'SHA-256'],
  },
  before: ['before', 'hashBefore'],
  after: ['after', 'hashAfter'],
  diff: ['diff', 'mask', 'diffMask'],
};

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

function formatNumber(n) {
  return Number(n).toLocaleString();
}

function formatMs(ms) {
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Printable ASCII is kept, everything else becomes ".". */
function previewText(bytes) {
  return Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  return undefined;
}

function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}

/** Gets the new message out of a collision result, or throws a clear error. */
function pickMessage(result, names, fnName) {
  const bytes = toBytes(result) || toBytes(pick(result, names));
  if (!bytes) {
    throw new Error(
      `${fnName}() returned a result in an unexpected shape. Update RESULT_FIELDS in collisionView.js.`,
    );
  }
  return bytes;
}

/** Turns one algorithm entry of avalancheTest() into numbers the view needs. */
function normalizeAlgorithm(raw, label) {
  const before = toBytes(pick(raw, RESULT_FIELDS.before));
  const after = toBytes(pick(raw, RESULT_FIELDS.after));
  let diff = toBytes(pick(raw, RESULT_FIELDS.diff));
  if (!diff && before && after) diff = xorBytes(before, after);
  if (!before || !after || !diff) {
    throw new Error(
      `Avalanche result for ${label} is in an unexpected shape. Update RESULT_FIELDS in collisionView.js.`,
    );
  }
  const changed = countSetBits(diff);
  const total = diff.length * 8;
  return { before, after, diff, changed, total, percent: (changed / total) * 100 };
}

function avalancheVerdict(changed, percent) {
  if (changed === 1) {
    return 'Exactly 1 output bit changed: the effect is tiny and predictable.';
  }
  return `${percent.toFixed(1)}% of the output bits changed.`;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function renderCollisionView(container) {
  // ----- lifetime and async guards -----
  let alive = true;
  let abortCtl = null;
  let debounceId = null;
  let busy = false;
  let flipToken = 0;
  let batchToken = 0;
  const timers = new Set();

  // ----- state -----
  const state = {
    msg: new Uint8Array(0),
    blockBytes: DEFAULT_BLOCK_BYTES,
    selectedBit: null,
  };

  // =========================================================================
  // Build the static DOM
  // =========================================================================

  const root = el('section', 'collision-view');

  const title = el('h2', null, 'Collision and Avalanche Lab');
  const intro = el(
    'p',
    'collision-intro',
    'Find collisions for XOR and RXOR instantly, watch SHA-256 resist, then flip a single input bit ' +
      'and compare how many output bits change.',
  );

  // ----- shared controls -----
  const controls = el('div', 'collision-controls');

  const messageInput = el('input');
  messageInput.type = 'text';
  messageInput.value = DEFAULT_MESSAGE;
  messageInput.maxLength = MAX_MESSAGE_CHARS;
  messageInput.autocomplete = 'off';
  messageInput.spellcheck = false;

  const otherInput = el('input');
  otherInput.type = 'text';
  otherInput.placeholder = 'Leave empty to flip the first bit of the message';
  otherInput.maxLength = MAX_MESSAGE_CHARS;
  otherInput.autocomplete = 'off';
  otherInput.spellcheck = false;

  const blockSelect = el('select');
  for (const bytes of ALLOWED_BLOCK_BYTES) {
    const opt = el('option', null, `${bytes * 8} bits (${bytes} byte${bytes > 1 ? 's' : ''})`);
    opt.value = String(bytes);
    if (bytes === DEFAULT_BLOCK_BYTES) opt.selected = true;
    blockSelect.append(opt);
  }

  controls.append(
    makeField('Message', messageInput),
    makeField('Other message (RXOR only, optional)', otherInput),
    makeField('Block size = XOR / RXOR hash size', blockSelect),
  );

  // ----- section 1: collision race -----
  const collisionSection = el('section', 'collision-section');
  collisionSection.append(el('h3', null, 'Collision race'));
  collisionSection.append(
    el(
      'p',
      'collision-hint',
      'XOR is commutative, so swapping two blocks keeps the hash. RXOR resists swapping, but one ' +
        'correcting block still forces any hash. SHA-256 has no shortcut: only brute force, and the ' +
        'work doubles for every 2 extra bits.',
    ),
  );

  const collisionActions = el('div', 'collision-actions');
  const xorBtn = makeButton('Find XOR collision');
  const rxorBtn = makeButton('Find RXOR collision');
  collisionActions.append(xorBtn, rxorBtn);

  const collisionOut = el('div', 'collision-output');
  collisionOut.append(
    el('p', 'collision-empty', 'Press a button to see two different messages with the same hash.'),
  );

  collisionSection.append(collisionActions, collisionOut);

  // ----- section 1b: birthday race -----
  collisionSection.append(el('h4', null, 'Race against truncated SHA-256'));

  const bitsSelect = el('select');
  for (const bits of BIRTHDAY_SHA_BITS) {
    const opt = el('option', null, `${bits} bits`);
    opt.value = String(bits);
    if (bits === DEFAULT_BIRTHDAY_BITS) opt.selected = true;
    bitsSelect.append(opt);
  }
  if (!BIRTHDAY_SHA_BITS.includes(DEFAULT_BIRTHDAY_BITS) && bitsSelect.options.length > 0) {
    bitsSelect.options[0].selected = true;
  }

  const raceActions = el('div', 'collision-actions');
  const raceBtn = makeButton('Start race');
  const sweepBtn = makeButton('Run size sweep');
  const cancelBtn = makeButton('Cancel', 'btn btn-secondary');
  cancelBtn.disabled = true;
  raceActions.append(makeField('SHA-256 truncated to', bitsSelect), raceBtn, sweepBtn, cancelBtn);

  const raceStatus = el('p', 'collision-status');
  raceStatus.setAttribute('role', 'status');

  const lanes = {
    xor: createLane('XOR', 'swap two blocks'),
    rxor: createLane('RXOR', 'append a correcting block'),
    sha: createLane('SHA-256 (truncated)', 'brute-force birthday search'),
  };
  const laneRow = el('div', 'race-lanes');
  laneRow.append(lanes.xor.root, lanes.rxor.root, lanes.sha.root);

  const raceNote = el(
    'p',
    'race-note',
    'Truncating SHA-256 is only a demo. The full 256-bit hash would need about 2^128 attempts.',
  );

  const sweepProgress = el('p', 'sweep-progress');
  const sweepChartBox = makeChartBox();
  const sweepCanvas = el('canvas');
  sweepCanvas.setAttribute('role', 'img');
  sweepCanvas.setAttribute(
    'aria-label',
    'Chart of attempts needed to find a collision versus hash size',
  );
  sweepChartBox.append(sweepCanvas);
  const sweepSummary = el('ul', 'sweep-summary');

  collisionSection.append(raceActions, raceStatus, laneRow, raceNote, sweepProgress, sweepChartBox, sweepSummary);

  // ----- section 2: avalanche -----
  const avalancheSection = el('section', 'collision-section');
  avalancheSection.append(el('h3', null, 'Avalanche test'));
  avalancheSection.append(
    el(
      'p',
      'collision-hint',
      'Click any bit of the message below to flip it. A good hash changes about half of its output; ' +
        'XOR and RXOR change one bit.',
    ),
  );

  const gridHost = el('div', 'avalanche-input');

  const avalancheActions = el('div', 'collision-actions');
  const randomBtn = makeButton('Flip random bit');
  const batchBtn = makeButton(`Run ${AVALANCHE_TRIALS} trials`);
  avalancheActions.append(randomBtn, batchBtn);

  const avalancheOut = el('div', 'avalanche-output');
  const avalancheEmpty = () =>
    el('p', 'collision-empty', 'Click a bit above, or press "Flip random bit".');
  avalancheOut.append(avalancheEmpty());

  const avalancheChartBox = makeChartBox();
  const avalancheCanvas = el('canvas');
  avalancheCanvas.setAttribute('role', 'img');
  avalancheCanvas.setAttribute(
    'aria-label',
    'Bar chart of the average percentage of output bits changed for XOR, RXOR and SHA-256',
  );
  avalancheChartBox.append(avalancheCanvas);
  const avalancheSummary = el('ul', 'avalanche-summary');

  avalancheSection.append(gridHost, avalancheActions, avalancheOut, avalancheChartBox, avalancheSummary);

  root.append(title, intro, controls, collisionSection, avalancheSection);
  container.replaceChildren(root);

  // =========================================================================
  // DOM factories that need no state
  // =========================================================================

  function makeChartBox() {
    const box = el('div', 'chart-box');
    box.style.position = 'relative';
    box.style.height = '300px';
    box.hidden = true;
    return box;
  }

  function createLane(name, subtitle) {
    const laneRoot = el('div', 'race-lane');
    laneRoot.dataset.state = 'idle';
    const status = el('p', 'race-lane-status', 'Waiting');
    const attempts = el('p', 'race-lane-attempts', 'Attempts: 0');
    const time = el('p', 'race-lane-time', 'Time: 0 ms');
    laneRoot.append(el('h5', 'race-lane-title', name), el('p', 'race-lane-sub', subtitle), status, attempts, time);
    return {
      root: laneRoot,
      set(laneState, text) {
        laneRoot.dataset.state = laneState;
        status.textContent = text;
      },
      setAttempts(value) {
        attempts.textContent = `Attempts: ${typeof value === 'number' ? formatNumber(value) : value}`;
      },
      setTime(ms) {
        time.textContent = `Time: ${formatMs(ms)}`;
      },
      reset() {
        laneRoot.dataset.state = 'idle';
        status.textContent = 'Waiting';
        attempts.textContent = 'Attempts: 0';
        time.textContent = 'Time: 0 ms';
      },
    };
  }

  // =========================================================================
  // Shared state helpers
  // =========================================================================

  function readMessage() {
    state.msg = textToBytes(messageInput.value);
  }

  /** Returns the message bytes, or null (with a toast) if there is none. */
  function getMessage() {
    if (state.msg.length === 0) {
      toast.warning('Type a message first.');
      return null;
    }
    return state.msg;
  }

  function getOtherBytes() {
    return otherInput.value ? textToBytes(otherInput.value) : undefined;
  }

  function setBusy(flag) {
    busy = flag;
    raceBtn.disabled = flag;
    sweepBtn.disabled = flag;
    cancelBtn.disabled = !flag;
    root.setAttribute('aria-busy', String(flag));
  }

  function isAbort(err) {
    return (err && err.name === 'AbortError') || Boolean(abortCtl && abortCtl.signal.aborted);
  }

  /** Starts a live timer. update(ms) is called every TICK_MS. */
  function startTicker(update) {
    const t0 = performance.now();
    const id = setInterval(() => {
      if (alive) update(performance.now() - t0);
    }, TICK_MS);
    timers.add(id);
    return {
      stop() {
        clearInterval(id);
        timers.delete(id);
        return performance.now() - t0;
      },
    };
  }

  function progressAttempts(p) {
    if (typeof p === 'number') return p;
    if (p && typeof p.attempts === 'number') return p.attempts;
    if (p && typeof p.count === 'number') return p.count;
    return undefined;
  }

  function resetResults() {
    collisionOut.replaceChildren(
      el('p', 'collision-empty', 'Press a button to see two different messages with the same hash.'),
    );
    avalancheOut.replaceChildren(avalancheEmpty());
    state.selectedBit = null;
    flipToken += 1;
  }

  // =========================================================================
  // Section 1a: show a concrete collision
  // =========================================================================

  function messageBox(heading, bytes) {
    const box = el('div', 'message-box');
    box.append(
      el('h5', null, heading),
      el('p', 'message-preview', previewText(bytes)),
      el('p', 'message-hex', `Hex: ${bytesToHex(bytes)}`),
      el('p', 'message-len', `${bytes.length} byte${bytes.length === 1 ? '' : 's'}`),
    );
    return box;
  }

  async function showCollision(label, original, collided, hashFn, ms) {
    // Always recompute with the real hash function: never trust the attack.
    const hashA = hashFn(original, state.blockBytes);
    const hashB = hashFn(collided, state.blockBytes);
    const sameHash = bytesEqual(hashA, hashB);
    const differentMessage = !bytesEqual(original, collided);

    const panel = el('div', 'collision-panel');
    panel.append(el('h4', 'collision-panel-title', `${label} collision`));

    const messages = el('div', 'collision-messages');
    messages.append(messageBox('Message A (original)', original), messageBox('Message B (collision)', collided));
    panel.append(messages);

    const hashes = el('div', 'collision-hashes');
    hashes.append(
      renderHashCard({ title: `${label} hash of A`, hash: hashA }),
      renderHashCard({
        title: `${label} hash of B`,
        hash: hashB,
        state: sameHash ? 'match' : 'mismatch',
      }),
    );
    panel.append(hashes);

    if (sameHash && differentMessage) {
      panel.append(
        el(
          'p',
          'collision-status',
          `Different messages, identical ${label} hash. Built in ${formatMs(ms)} with no searching.`,
        ),
      );
    } else {
      const reason = !differentMessage
        ? 'The collision message is identical to the original, so this is not a real collision.'
        : 'The two hashes differ, so this is not a collision.';
      panel.append(el('p', 'collision-warning', reason));
      toast.warning(reason);
    }

    if (label === 'RXOR') {
      panel.append(
        el(
          'p',
          'collision-note',
          'Message B ends with a correcting block of arbitrary bytes, so some characters show as ".". ' +
            'The hex line has the exact bytes. In a real attack this block could be hidden, for example ' +
            'in a comment field.',
        ),
      );
    }

    const shaBox = el('div', 'collision-sha');
    shaBox.append(el('p', 'collision-note', 'Computing SHA-256 of both messages...'));
    panel.append(shaBox);

    collisionOut.replaceChildren(panel);

    try {
      const [shaA, shaB] = await Promise.all([sha256(original), sha256(collided)]);
      if (!alive || collisionOut.firstChild !== panel) return;
      const shaSame = bytesEqual(shaA, shaB);
      shaBox.replaceChildren(
        el(
          'p',
          'collision-note',
          shaSame
            ? 'The same two messages also collide under SHA-256 (unexpected).'
            : 'The same two messages under SHA-256 give completely different hashes:',
        ),
        renderHashCard({ title: 'SHA-256 of A', hash: shaA }),
        renderHashCard({ title: 'SHA-256 of B', hash: shaB, state: shaSame ? 'match' : 'mismatch' }),
      );
    } catch (err) {
      if (!alive || collisionOut.firstChild !== panel) return;
      shaBox.replaceChildren(el('p', 'collision-warning', `SHA-256 comparison unavailable: ${errorText(err)}`));
    }
  }

  async function onXorCollision() {
    const msg = getMessage();
    if (!msg) return;
    try {
      const t0 = performance.now();
      const result = await xorBlockSwapCollision(msg, state.blockBytes);
      const ms = performance.now() - t0;
      const collided = pickMessage(result, RESULT_FIELDS.xorMessage, 'xorBlockSwapCollision');
      await showCollision('XOR', msg, collided, xorHash, ms);
    } catch (err) {
      toast.error(err);
    }
  }

  async function onRxorCollision() {
    const msg = getMessage();
    if (!msg) return;
    try {
      const t0 = performance.now();
      const result = await rxorCollision(msg, state.blockBytes, getOtherBytes());
      const ms = performance.now() - t0;
      const collided = pickMessage(result, RESULT_FIELDS.rxorMessage, 'rxorCollision');
      await showCollision('RXOR', msg, collided, rxorHash, ms);
    } catch (err) {
      toast.error(err);
    }
  }

  // =========================================================================
  // Section 1b: the race and the size sweep
  // =========================================================================

  async function runInstantLane(lane, fn) {
    const t0 = performance.now();
    try {
      await fn();
      lane.setAttempts('1 (direct construction)');
      lane.setTime(performance.now() - t0);
      lane.set('done', 'Collision found instantly');
    } catch (err) {
      lane.set('error', errorText(err));
      toast.error(err);
    }
  }

  async function onStartRace() {
    const msg = getMessage();
    if (!msg || busy) return;

    const bits = Number(bitsSelect.value);
    const blockBytes = state.blockBytes;
    const other = getOtherBytes();

    abortCtl = new AbortController();
    const ctl = abortCtl;
    setBusy(true);
    raceStatus.textContent = 'Race started.';
    sweepProgress.textContent = '';
    Object.values(lanes).forEach((lane) => lane.reset());

    // XOR and RXOR finish at once; they are still timed for the display.
    await runInstantLane(lanes.xor, () => xorBlockSwapCollision(msg, blockBytes));
    await runInstantLane(lanes.rxor, () => rxorCollision(msg, blockBytes, other));

    // SHA-256 runs with live counters.
    lanes.sha.set('running', `Searching for a ${bits}-bit collision...`);
    const ticker = startTicker((ms) => lanes.sha.setTime(ms));
    try {
      const result = await birthdayCollisionSha(bits, {
        signal: ctl.signal,
        onProgress: (p) => {
          const n = progressAttempts(p);
          if (alive && n !== undefined) lanes.sha.setAttempts(n);
        },
      });
      const elapsed = ticker.stop();
      if (!alive) return;

      if (result && result.found === false && ctl.signal.aborted) {
        lanes.sha.set('cancelled', 'Cancelled');
        raceStatus.textContent = 'Race cancelled.';
        return;
      }
      if (!result || result.found === false) {
        lanes.sha.set('error', 'No collision found');
        raceStatus.textContent = 'SHA-256 search finished without a collision.';
        return;
      }
      const expected =
        typeof result.expectedAttempts === 'number'
          ? result.expectedAttempts
          : 1.2533 * 2 ** (bits / 2);
      lanes.sha.setAttempts(result.attempts);
      lanes.sha.setTime(typeof result.elapsedMs === 'number' ? result.elapsedMs : elapsed);
      lanes.sha.set(
        'done',
        `Collision after ${formatNumber(result.attempts)} attempts (expected about ${formatNumber(Math.round(expected))})`,
      );
      raceStatus.textContent = 'Race finished.';
    } catch (err) {
      ticker.stop();
      if (!alive) return;
      if (isAbort(err)) {
        lanes.sha.set('cancelled', 'Cancelled');
        raceStatus.textContent = 'Race cancelled.';
      } else {
        lanes.sha.set('error', errorText(err));
        toast.error(err);
      }
    } finally {
      if (alive) setBusy(false);
    }
  }

  async function onSweep() {
    if (busy) return;
    abortCtl = new AbortController();
    const ctl = abortCtl;
    setBusy(true);
    raceStatus.textContent = 'Size sweep started.';
    sweepSummary.replaceChildren();
    const ticker = startTicker((ms) => {
      sweepProgress.dataset.elapsed = String(Math.round(ms));
    });
    try {
      const results = await birthdaySweep(BIRTHDAY_SHA_BITS, {
        signal: ctl.signal,
        onProgress: (p) => {
          if (!alive) return;
          const n = progressAttempts(p);
          if (n === undefined) return;
          const where = p && typeof p.bits === 'number' ? `${p.bits}-bit search: ` : '';
          sweepProgress.textContent = `${where}${formatNumber(n)} attempts so far...`;
        },
      });
      ticker.stop();
      if (!alive) return;

      if (ctl.signal.aborted) {
        raceStatus.textContent = 'Size sweep cancelled.';
        sweepProgress.textContent = '';
        return;
      }

      sweepChartBox.hidden = false;
      renderCollisionChart(sweepCanvas, results);

      for (const r of results) {
        const text = r.found
          ? `${r.bits} bits: ${formatNumber(r.attempts)} attempts ` +
            `(expected about ${formatNumber(Math.round(r.expectedAttempts))}), ${formatMs(r.elapsedMs)}`
          : `${r.bits} bits: no collision found`;
        sweepSummary.append(el('li', null, text));
      }
      sweepProgress.textContent = '';
      raceStatus.textContent = 'Size sweep finished: every 2 extra bits roughly doubles the work.';
    } catch (err) {
      ticker.stop();
      if (!alive) return;
      if (isAbort(err)) {
        raceStatus.textContent = 'Size sweep cancelled.';
        sweepProgress.textContent = '';
      } else {
        toast.error(err);
      }
    } finally {
      if (alive) setBusy(false);
    }
  }

  // =========================================================================
  // Section 2: avalanche
  // =========================================================================

  function renderInputGrid() {
    const totalBits = state.msg.length * 8;
    if (totalBits === 0) {
      gridHost.replaceChildren(el('p', 'collision-empty', 'Type a message to see its bits.'));
      return;
    }
    const grid = renderBitGrid(state.msg, {
      bytesPerRow: 4,
      showHex: true,
      maxBytes: INPUT_GRID_MAX_BYTES,
      selectedIndex: state.selectedBit === null ? undefined : state.selectedBit,
      onCellClick: (bitIndex) => {
        flipBit(bitIndex);
      },
      label: 'Message bits. Press a bit to flip it and compare the hashes.',
    });
    gridHost.replaceChildren(grid);
    if (state.selectedBit !== null) {
      const cell = gridHost.querySelector(`[data-bit-index="${state.selectedBit}"]`);
      if (cell && typeof cell.focus === 'function') cell.focus();
    }
  }

  function renderAvalancheResult(result, bitIndex) {
    const algorithms = [
      { title: 'XOR', names: RESULT_FIELDS.algorithms.xor },
      { title: 'RXOR', names: RESULT_FIELDS.algorithms.rxor },
      { title: 'SHA-256', names: RESULT_FIELDS.algorithms.sha },
    ].map(({ title: algoTitle, names }) => {
      const raw = pick(result, names);
      if (!raw) {
        throw new Error(
          `avalancheTest() has no entry for ${algoTitle}. Update RESULT_FIELDS in collisionView.js.`,
        );
      }
      return { title: algoTitle, ...normalizeAlgorithm(raw, algoTitle) };
    });

    const wrap = el('div', 'avalanche-results');
    wrap.append(
      el(
        'p',
        'avalanche-flipped',
        `Flipped input bit ${bitIndex} (byte ${Math.floor(bitIndex / 8)}, ${bitIndex % 8} places from the left of that byte).`,
      ),
    );

    const cards = el('div', 'avalanche-cards');
    for (const a of algorithms) {
      const col = el('div', 'avalanche-col');
      col.append(
        renderHashCard({
          title: `${a.title} hash after the flip`,
          hash: a.after,
          showGrid: true,
          highlightChanged: a.diff,
        }),
        el('p', 'avalanche-before', `Before: ${bytesToHex(a.before)}`),
        el('p', 'avalanche-count', `${a.changed} of ${a.total} output bits changed (${a.percent.toFixed(1)}%)`),
        el('p', 'avalanche-verdict', avalancheVerdict(a.changed, a.percent)),
      );
      cards.append(col);
    }
    wrap.append(cards);
    return wrap;
  }

  async function flipBit(bitIndex) {
    const msg = getMessage();
    if (!msg) return;
    const token = (flipToken += 1);
    state.selectedBit = bitIndex;
    renderInputGrid();
    try {
      const result = await avalancheTest(msg, bitIndex, state.blockBytes);
      if (!alive || token !== flipToken) return;
      avalancheOut.replaceChildren(renderAvalancheResult(result, bitIndex));
    } catch (err) {
      if (!alive || token !== flipToken) return;
      toast.error(err);
    }
  }

  function onRandomFlip() {
    const msg = getMessage();
    if (!msg) return;
    flipBit(Math.floor(Math.random() * msg.length * 8));
  }

  async function onBatch() {
    const msg = getMessage();
    if (!msg) return;
    const token = (batchToken += 1);
    batchBtn.disabled = true;
    try {
      const batch = await avalancheBatch(msg, AVALANCHE_TRIALS, state.blockBytes);
      if (!alive || token !== batchToken) return;
      const data = toChartData(batch);

      avalancheChartBox.hidden = false;
      renderAvalancheChart(avalancheCanvas, data);

      avalancheSummary.replaceChildren();
      data.labels.forEach((labelText, i) => {
        let text = `${labelText}: ${Number(data.values[i]).toFixed(1)}% of output bits changed on average`;
        if (Array.isArray(data.changedBits) && typeof data.changedBits[i] === 'number') {
          text += ` (about ${data.changedBits[i].toFixed(1)} bits)`;
        }
        avalancheSummary.append(el('li', null, text));
      });
    } catch (err) {
      if (!alive || token !== batchToken) return;
      toast.error(err);
    } finally {
      if (alive && token === batchToken) batchBtn.disabled = false;
    }
  }

  // =========================================================================
  // Wiring
  // =========================================================================

  xorBtn.addEventListener('click', onXorCollision);
  rxorBtn.addEventListener('click', onRxorCollision);
  raceBtn.addEventListener('click', onStartRace);
  sweepBtn.addEventListener('click', onSweep);
  cancelBtn.addEventListener('click', () => {
    if (abortCtl) abortCtl.abort();
  });
  randomBtn.addEventListener('click', onRandomFlip);
  batchBtn.addEventListener('click', onBatch);

  messageInput.addEventListener('input', () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      if (!alive) return;
      readMessage();
      resetResults();
      renderInputGrid();
    }, DEBOUNCE_MS);
  });

  blockSelect.addEventListener('change', () => {
    state.blockBytes = Number(blockSelect.value);
    resetResults();
  });

  // ----- first paint -----
  readMessage();
  renderInputGrid();

  // =========================================================================
  // Cleanup (called by router.js before another view is shown)
  // =========================================================================

  return function cleanup() {
    alive = false;
    if (abortCtl) abortCtl.abort();
    clearTimeout(debounceId);
    timers.forEach((id) => clearInterval(id));
    timers.clear();
    for (const canvas of [sweepCanvas, avalancheCanvas]) {
      try {
        destroyChart(canvas);
      } catch (err) {
        // The chart may never have been created; nothing to destroy.
      }
    }
  };
}