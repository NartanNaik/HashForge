/**
 * ============================================================================
 *  File    : js/ui/forgeryView.js
 *  Project : Hash Forge
 *  Module  : Forgery Attack Lab view (proves Slide 10)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  The screen for Module 2. It shows, step by step, the attack from Slide 10
 *  ("only the hash code is encrypted"):
 *
 *    The message travels in PLAINTEXT and only its hash is protected. An
 *    attacker writes a malicious message, APPENDS one n-bit correcting block,
 *    and the forged message gets exactly the SAME hash as the original. The
 *    receiver recomputes the hash, sees a match, and never notices.
 *
 *  THE THREE PANELS (as in the project spec)
 *  -----------------------------------------
 *  1. Original message   the user's message and its XOR / RXOR hash
 *                        (updates live while typing).
 *  2. Forged message     the attacker's malicious message, with a note about
 *                        how many zero bytes will be needed to align it.
 *  3. Result             after pressing "Forge it":
 *       - a banner "HASHES MATCH" (or "HASHES DIFFER" if it ever failed),
 *       - the original hash next to the forged hash,
 *       - the appended correcting block in HEX, BINARY and as a bit grid,
 *       - the Slide 10 maths worked out with the real numbers,
 *       - the message the attacker actually sends (text preview + hex).
 *
 *  BELOW THE PANELS: SHA-256 COMPARISON
 *       The same two messages hashed with SHA-256 give completely different
 *       hashes (with the number of differing bits out of 256). This is the
 *       "real hash resisting the same attack" part of the demo.
 *
 *  A SCENARIO DROPDOWN preloads examples ("Pay ₹100 → ₹10,000", ...) and a
 *  "Custom" entry. Typing in either message box switches it to Custom.
 *
 *  All calculation is done by core/ and attacks/forgery.js. This file only
 *  collects input and draws the result.
 *
 *  WHAT I IMPLEMENTED (exported function)
 *  --------------------------------------
 *  renderForgeryView(container) -> cleanup function
 *     Builds the whole view inside `container` (the empty #view element given
 *     by router.js) and returns a cleanup function that drops pending timers
 *     and marks the view as closed, so a late SHA-256 result is never drawn
 *     into a page that is gone. router.js must call it before showing another
 *     view (same contract as analyzerView.js and collisionView.js).
 *
 *  CONTROLS
 *    Scenario     preloaded original / forged pairs, or Custom.
 *    Algorithm    XOR or RXOR (decides the hash and the forge function).
 *    Block size   from ALLOWED_BLOCK_BYTES (default 2 bytes = 16 bits). This
 *                 is also the hash width, so the target hash always has the
 *                 same length as one block, as forgery.js requires.
 *    Forge it     runs the attack.
 *
 *  BEHAVIOUR NOTES
 *  ---------------
 *  - The target hash is the hash of the ORIGINAL message, computed here with
 *    the real xorHash() / rxorHash().
 *  - After forging, the final hash is recomputed here AGAIN with the real
 *    hash function and compared with the target. The banner is green only if
 *    both forgery.js (`verified`) and this independent check agree, so a wrong
 *    forgery can never be displayed as a success.
 *  - The worked maths (S, T, X for XOR; h', ROL1(h'), T, X for RXOR) is
 *    recomputed from the padded forged message. If it ever disagrees with the
 *    block forgery.js appended, a warning line says so.
 *  - Changing any input, the algorithm or the block size clears the old
 *    result (it would be out of date). Typing is debounced (150 ms).
 *  - If the forged message equals the original there is nothing to forge, and
 *    a warning toast explains it.
 *  - Errors thrown by forgery.js are shown with toast.error(err).
 *  - Text previews show "." for any byte that is not printable ASCII (this
 *    includes the 3 bytes of the ₹ sign). The hex line always has the exact
 *    bytes.
 *  - HONEST LIMITATION (stated on screen): the appended block is essentially
 *    arbitrary bytes, so it usually looks like unreadable characters. In a
 *    real attack it could be hidden, for example in a comment field.
 *  - Everything is built with createElement/textContent (no innerHTML), so
 *    text typed by the user can never inject HTML.
 *
 *  ASSUMPTIONS ABOUT YOUR OTHER FILES (please check)
 *  -------------------------------------------------
 *    - forgeXor / forgeRxor(forgedBytes, targetHash, blockBytes) return the
 *      object documented in forgery.js: paddedMessage, appendedBlock,
 *      appendedHex, appendedPreview, appendedIsPrintable, finalMessage,
 *      finalHash, targetHash, verified, paddingAdded, blockBytes.
 *    - xorHash / rxorHash are synchronous, use zero padding and no length
 *      block (the default), so they match forgery.js exactly.
 *    - bitUtils.js exports textToBytes, bytesToHex, bytesToBinaryString,
 *      xorBytes, rotateLeft1, hammingDistance (all listed in its header).
 *    - renderHashCard accepts { title, hash, state, statusText } and
 *      renderBitGrid accepts { bytesPerRow, showBitPositions, label }, as in
 *      their headers.
 *
 *  CSS CLASSES (style them in css/components.css and css/layout.css)
 *  -----------------------------------------------------------------
 *    .forgery-view  .forgery-intro  .forgery-controls  .field  .field-label
 *    .forgery-actions  .forgery-panels  .forgery-panel  .forgery-panel-note
 *    .forgery-info  .forgery-empty  .forgery-result  .forgery-banner
 *    (data-state: match | mismatch)  .forgery-hashes  .forgery-block
 *    .forgery-block-row  .forgery-block-label  .forgery-block-value
 *    .forgery-steps  .forgery-warning  .forgery-note  .forgery-sent
 *    .forgery-sha  .forgery-sha-cards  .forgery-sha-verdict
 *
 *  USED BY : js/ui/router.js (route #/forgery)
 *  DEPENDS : core/config.js, core/bitUtils.js, core/xorHash.js,
 *            core/rxorHash.js, core/sha256.js, attacks/forgery.js,
 *            ui/components/bitGrid.js, ui/components/hashCard.js,
 *            ui/components/toast.js
 * ============================================================================
 */

import { DEFAULT_BLOCK_BYTES, ALLOWED_BLOCK_BYTES } from '../core/config.js';
import {
  textToBytes,
  bytesToHex,
  bytesToBinaryString,
  xorBytes,
  rotateLeft1,
  hammingDistance,
} from '../core/bitUtils.js';
import { xorHash } from '../core/xorHash.js';
import { rxorHash } from '../core/rxorHash.js';
import { sha256 } from '../core/sha256.js';
import { forgeXor, forgeRxor } from '../attacks/forgery.js';
import { renderBitGrid } from './components/bitGrid.js';
import { renderHashCard } from './components/hashCard.js';
import { toast } from './components/toast.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGE_CHARS = 256;
const DEBOUNCE_MS = 150;
const CUSTOM_ID = 'custom';

/** Preloaded demo pairs. The forged message is what the attacker wants sent. */
const SCENARIOS = [
  {
    id: 'pay',
    label: 'Pay ₹100 → ₹10,000',
    original: 'Pay ₹100 to Ravi',
    forged: 'Pay ₹10,000 to Ravi',
  },
  {
    id: 'payee',
    label: 'Change the payee',
    original: 'Transfer 500 to Asha',
    forged: 'Transfer 500 to Mallory',
  },
  {
    id: 'marks',
    label: 'Edit exam marks',
    original: 'Marks: Maths 45, Physics 52',
    forged: 'Marks: Maths 95, Physics 92',
  },
  {
    id: 'rent',
    label: 'Contract clause: rent',
    original: 'Rent is 8000 per month',
    forged: 'Rent is 80000 per month',
  },
];

/** The two algorithms the lab can attack. */
const ALGORITHMS = {
  XOR: { hash: xorHash, forge: forgeXor },
  RXOR: { hash: rxorHash, forge: forgeRxor },
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

function makeTextInput(value, placeholder) {
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = MAX_MESSAGE_CHARS;
  input.autocomplete = 'off';
  input.spellcheck = false;
  return input;
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

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A labelled line such as "Hex: 4849" inside the appended-block box. */
function blockRow(label, value) {
  const row = el('p', 'forgery-block-row');
  row.append(el('span', 'forgery-block-label', `${label}: `), el('span', 'forgery-block-value', value));
  return row;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function renderForgeryView(container) {
  // ----- lifetime and async guards -----
  let alive = true;
  let debounceId = null;
  let forgeToken = 0;

  // ----- state -----
  const state = {
    algo: 'XOR',
    blockBytes: DEFAULT_BLOCK_BYTES,
  };

  // =========================================================================
  // Build the static DOM
  // =========================================================================

  const root = el('section', 'forgery-view');

  const title = el('h2', null, 'Forgery Attack Lab');
  const intro = el(
    'p',
    'forgery-intro',
    'The message is sent in plaintext and only its hash is protected. Write a malicious message, and the ' +
      'lab computes the one extra block that makes it hash to exactly the same value as the original.',
  );

  // ----- controls -----
  const controls = el('div', 'forgery-controls');

  const scenarioSelect = el('select');
  for (const s of SCENARIOS) {
    const opt = el('option', null, s.label);
    opt.value = s.id;
    scenarioSelect.append(opt);
  }
  const customOpt = el('option', null, 'Custom');
  customOpt.value = CUSTOM_ID;
  scenarioSelect.append(customOpt);

  const algoSelect = el('select');
  for (const name of Object.keys(ALGORITHMS)) {
    const opt = el('option', null, name);
    opt.value = name;
    algoSelect.append(opt);
  }

  const blockSelect = el('select');
  for (const bytes of ALLOWED_BLOCK_BYTES) {
    const opt = el('option', null, `${bytes * 8} bits (${plural(bytes, 'byte')})`);
    opt.value = String(bytes);
    if (bytes === DEFAULT_BLOCK_BYTES) opt.selected = true;
    blockSelect.append(opt);
  }

  controls.append(
    makeField('Scenario', scenarioSelect),
    makeField('Algorithm', algoSelect),
    makeField('Block size = hash size', blockSelect),
  );

  // ----- panel 1: original message -----
  const originalInput = makeTextInput('', 'The genuine message');
  const originalInfo = el('p', 'forgery-info');
  const originalHashHost = el('div', 'forgery-hashes');
  const panelOriginal = el('section', 'forgery-panel');
  panelOriginal.append(
    el('h3', null, '1. Original message'),
    el(
      'p',
      'forgery-panel-note',
      'This is what the sender signs. Only its hash is protected, for example by encryption.',
    ),
    makeField('Original message', originalInput),
    originalInfo,
    originalHashHost,
  );

  // ----- panel 2: forged message -----
  const forgedInput = makeTextInput('', 'The attacker\'s malicious message');
  const forgedInfo = el('p', 'forgery-info');
  const panelForged = el('section', 'forgery-panel');
  panelForged.append(
    el('h3', null, '2. Attacker\'s forged message'),
    el(
      'p',
      'forgery-panel-note',
      'The attacker changes the plaintext freely. The lab will pad it and add one correcting block.',
    ),
    makeField('Forged message', forgedInput),
    forgedInfo,
  );

  // ----- panel 3: result -----
  const forgeBtn = makeButton('Forge it');
  const forgeActions = el('div', 'forgery-actions');
  forgeActions.append(forgeBtn);

  const resultOut = el('div', 'forgery-result');
  const resultEmpty = () =>
    el('p', 'forgery-empty', 'Press "Forge it" to compute the correcting block and compare the hashes.');
  resultOut.append(resultEmpty());

  const panelResult = el('section', 'forgery-panel');
  panelResult.append(el('h3', null, '3. Result'), forgeActions, resultOut);

  const panels = el('div', 'forgery-panels');
  panels.append(panelOriginal, panelForged, panelResult);

  // ----- SHA-256 comparison (filled after forging) -----
  const shaSection = el('section', 'forgery-sha');
  shaSection.hidden = true;

  root.append(title, intro, controls, panels, shaSection);
  container.replaceChildren(root);

  // =========================================================================
  // State helpers
  // =========================================================================

  function loadScenario(id) {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) return;
    originalInput.value = scenario.original;
    forgedInput.value = scenario.forged;
  }

  function readInputs() {
    return {
      original: textToBytes(originalInput.value),
      forged: textToBytes(forgedInput.value),
    };
  }

  /** Redraws the live parts of panels 1 and 2 (hash, sizes, padding note). */
  function refreshPanels() {
    const { original, forged } = readInputs();
    const { blockBytes } = state;
    const hashFn = ALGORITHMS[state.algo].hash;

    const blocks = Math.ceil(original.length / blockBytes);
    originalInfo.textContent =
      `${plural(original.length, 'byte')}, ${plural(blocks, 'block')} of ${blockBytes * 8} bits.`;
    originalHashHost.replaceChildren(
      renderHashCard({
        title: `${state.algo} hash of the original (the target)`,
        hash: hashFn(original, blockBytes),
      }),
    );

    const padding = (blockBytes - (forged.length % blockBytes)) % blockBytes;
    forgedInfo.textContent =
      `${plural(forged.length, 'byte')}. Will get ${plural(padding, 'zero byte')} of padding, ` +
      `then one ${blockBytes * 8}-bit correcting block.`;
  }

  function clearResult() {
    forgeToken += 1;
    resultOut.replaceChildren(resultEmpty());
    shaSection.hidden = true;
    shaSection.replaceChildren();
  }

  function onInputsChanged() {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      if (!alive) return;
      refreshPanels();
      clearResult();
    }, DEBOUNCE_MS);
  }

  // =========================================================================
  // Rendering the result
  // =========================================================================

  /** The Slide 10 maths, worked out with the real numbers. */
  function buildWorkings(res, target) {
    const { blockBytes } = state;
    const list = el('ol', 'forgery-steps');
    const fmt = (bytes) => `${bytesToHex(bytes)} (${bytesToBinaryString(bytes)})`;
    let expected;

    if (state.algo === 'XOR') {
      const s = xorHash(res.paddedMessage, blockBytes);
      expected = xorBytes(s, target);
      list.append(
        el('li', null, `S = XOR of all blocks of the padded forged message = ${fmt(s)}`),
        el('li', null, `T = target hash (hash of the original) = ${fmt(target)}`),
        el('li', null, `X = S ^ T = ${fmt(expected)}   <- the appended block`),
        el('li', null, 'New hash = S ^ X = S ^ S ^ T = T, because S ^ S = 0.'),
      );
    } else {
      const hPrime = rxorHash(res.paddedMessage, blockBytes);
      const rotated = rotateLeft1(hPrime);
      expected = xorBytes(rotated, target);
      list.append(
        el('li', null, `h' = RXOR hash of the padded forged message = ${fmt(hPrime)}`),
        el('li', null, `ROL1(h') = h' rotated left by one bit = ${fmt(rotated)}`),
        el('li', null, `T = target hash (hash of the original) = ${fmt(target)}`),
        el('li', null, `X = ROL1(h') ^ T = ${fmt(expected)}   <- the appended block`),
        el('li', null, 'Next step: ROL1(h\') ^ X = ROL1(h\') ^ ROL1(h\') ^ T = T.'),
      );
    }
    return { list, agrees: bytesEqual(expected, res.appendedBlock) };
  }

  function buildBlockBox(res) {
    const box = el('div', 'forgery-block');
    box.append(
      el('h4', null, `Appended correcting block (${res.appendedBlock.length * 8} bits)`),
      blockRow('Hex', res.appendedHex || bytesToHex(res.appendedBlock)),
      blockRow('Binary', bytesToBinaryString(res.appendedBlock)),
      blockRow('As text', res.appendedPreview || previewText(res.appendedBlock)),
      renderBitGrid(res.appendedBlock, {
        bytesPerRow: 4,
        showBitPositions: true,
        label: 'Bits of the appended correcting block',
      }),
      el(
        'p',
        'forgery-note',
        res.appendedIsPrintable
          ? 'This block happens to be readable text, which is a coincidence.'
          : 'Honest limitation: the block is essentially arbitrary bytes, so it usually looks like unreadable ' +
              'characters (shown as "."). In a real attack it could be hidden, for example in a comment field.',
      ),
    );
    return box;
  }

  function buildResult(res, original, target, hashFn) {
    const { blockBytes } = state;

    // Independent check with the real hash function.
    const realFinal = hashFn(res.finalMessage, blockBytes);
    const matches = Boolean(res.verified) && bytesEqual(realFinal, target);

    const wrap = el('div', 'forgery-result-body');

    const banner = el('div', 'forgery-banner');
    banner.dataset.state = matches ? 'match' : 'mismatch';
    banner.setAttribute('role', 'status');
    banner.append(
      el('strong', null, matches ? '✔ HASHES MATCH' : '✘ HASHES DIFFER'),
      el(
        'span',
        null,
        matches
          ? ` The receiver recomputes the ${state.algo} hash, gets ${bytesToHex(realFinal)}, and accepts the forged message.`
          : ' The forged message does not reproduce the target hash.',
      ),
    );
    wrap.append(banner);

    const hashes = el('div', 'forgery-hashes');
    hashes.append(
      renderHashCard({ title: `${state.algo} hash of the original`, hash: target }),
      renderHashCard({
        title: `${state.algo} hash of the forged message`,
        hash: realFinal,
        state: matches ? 'match' : 'mismatch',
      }),
    );
    wrap.append(hashes);

    wrap.append(buildBlockBox(res));

    wrap.append(
      el(
        'p',
        'forgery-info',
        `Zero padding added to align the forged message: ${plural(res.paddingAdded, 'byte')}.`,
      ),
    );

    wrap.append(el('h4', null, 'How the block is computed'));
    const workings = buildWorkings(res, target);
    wrap.append(workings.list);
    if (!workings.agrees) {
      wrap.append(
        el(
          'p',
          'forgery-warning',
          'Warning: the worked maths above disagrees with the block forgery.js appended. Check attacks/forgery.js.',
        ),
      );
    }

    const sent = el('div', 'forgery-sent');
    sent.append(
      el('h4', null, 'What the attacker actually sends'),
      el('p', 'forgery-info', `Forged message + padding + correcting block (${plural(res.finalMessage.length, 'byte')}).`),
      blockRow('As text', previewText(res.finalMessage)),
      blockRow('Hex', bytesToHex(res.finalMessage)),
    );
    wrap.append(sent);

    return { node: wrap, original };
  }

  async function renderShaComparison(original, finalMessage, token) {
    shaSection.hidden = false;
    shaSection.replaceChildren(
      el('h3', null, 'Same two messages under SHA-256'),
      el('p', 'forgery-note', 'Computing SHA-256...'),
    );
    try {
      const [shaA, shaB] = await Promise.all([sha256(original), sha256(finalMessage)]);
      if (!alive || token !== forgeToken) return;

      const same = bytesEqual(shaA, shaB);
      const differing = hammingDistance(shaA, shaB);
      const totalBits = shaA.length * 8;

      const cards = el('div', 'forgery-sha-cards');
      cards.append(
        renderHashCard({ title: 'SHA-256 of the original', hash: shaA }),
        renderHashCard({
          title: 'SHA-256 of the forged message',
          hash: shaB,
          state: same ? 'match' : 'mismatch',
        }),
      );

      shaSection.replaceChildren(
        el('h3', null, 'Same two messages under SHA-256'),
        el(
          'p',
          'forgery-sha-verdict',
          same
            ? 'The hashes are equal under SHA-256 too (this should never happen).'
            : `The ${state.algo} hashes match, but the SHA-256 hashes differ in ${differing} of ${totalBits} ` +
                'bits. The receiver would notice the forgery.',
        ),
        cards,
        el(
          'p',
          'forgery-note',
          'SHA-256 has no "append a correcting block" shortcut: changing the message changes the hash ' +
            'unpredictably, so the attacker cannot steer it to a chosen value.',
        ),
      );
    } catch (err) {
      if (!alive || token !== forgeToken) return;
      shaSection.replaceChildren(
        el('h3', null, 'Same two messages under SHA-256'),
        el('p', 'forgery-warning', `SHA-256 comparison unavailable: ${err instanceof Error ? err.message : err}`),
      );
    }
  }

  // =========================================================================
  // The attack
  // =========================================================================

  async function onForge() {
    const { original, forged } = readInputs();
    if (original.length === 0) {
      toast.warning('Type the original message first.');
      return;
    }
    if (forged.length === 0) {
      toast.warning('Type the forged message first.');
      return;
    }
    if (bytesEqual(original, forged)) {
      toast.warning('The forged message is the same as the original, so there is nothing to forge.');
      return;
    }

    const token = (forgeToken += 1);
    const { blockBytes } = state;
    const { hash: hashFn, forge } = ALGORITHMS[state.algo];

    try {
      const target = hashFn(original, blockBytes);
      const res = await forge(forged, target, blockBytes);
      if (!alive || token !== forgeToken) return;

      const built = buildResult(res, original, target, hashFn);
      resultOut.replaceChildren(built.node);
      await renderShaComparison(original, res.finalMessage, token);
    } catch (err) {
      if (!alive || token !== forgeToken) return;
      toast.error(err);
    }
  }

  // =========================================================================
  // Wiring
  // =========================================================================

  forgeBtn.addEventListener('click', onForge);

  scenarioSelect.addEventListener('change', () => {
    if (scenarioSelect.value !== CUSTOM_ID) loadScenario(scenarioSelect.value);
    refreshPanels();
    clearResult();
  });

  const onMessageTyped = () => {
    scenarioSelect.value = CUSTOM_ID;
    onInputsChanged();
  };
  originalInput.addEventListener('input', onMessageTyped);
  forgedInput.addEventListener('input', onMessageTyped);

  algoSelect.addEventListener('change', () => {
    state.algo = algoSelect.value;
    refreshPanels();
    clearResult();
  });

  blockSelect.addEventListener('change', () => {
    state.blockBytes = Number(blockSelect.value);
    refreshPanels();
    clearResult();
  });

  // ----- first paint -----
  loadScenario(SCENARIOS[0].id);
  scenarioSelect.value = SCENARIOS[0].id;
  refreshPanels();

  // =========================================================================
  // Cleanup (called by router.js before another view is shown)
  // =========================================================================

  return function cleanup() {
    alive = false;
    clearTimeout(debounceId);
  };
}