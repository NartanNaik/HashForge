/**
 * ============================================================================
 *  File    : js/ui/learnView.js
 *  Project : Hash Forge
 *  Module  : Learn Panel view (the presentation companion, Slides 1, 4, 5)
 * ============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  The screen for Module 5. It is a static explainer page, so the app doubles
 *  as a companion to the presentation. It contains no attack logic and no
 *  user input; it only explains the theory and points to the live labs.
 *
 *  WHAT THE PAGE SHOWS (in this order)
 *  -----------------------------------
 *  1. What is a hash function?   fixed-size fingerprint of any message, plus
 *                                padding and blocks (links to Slide 2 ideas).
 *  2. Properties                 the seven properties of a good hash
 *                                (variable input, fixed output, efficiency,
 *                                preimage / second-preimage / collision
 *                                resistance, pseudorandom output), each with
 *                                the lab that tests it.
 *  3. Applications               message authentication, digital signatures,
 *                                password storage, file integrity, intrusion
 *                                and virus detection, other uses.
 *  4. XOR vs RXOR vs SHA-256     one comparison table: formula, block order,
 *                                swap collision, forgery, avalanche, wasted
 *                                bits on ASCII, linearity, verdict.
 *  5. Why XOR and RXOR are       five short cards (forgery, block swapping,
 *     insecure                   no avalanche, predictable data, birthday
 *                                bound), each linking to the lab that proves
 *                                it.
 *  6. Worked example             "HI" and "IH" with 1-byte blocks, calculated
 *                                LIVE with the real xorHash() / rxorHash(),
 *                                so the numbers on screen can never be wrong.
 *
 *  A row of "jump to" buttons at the top scrolls to each section.
 *
 *  WHAT I IMPLEMENTED (exported function)
 *  --------------------------------------
 *  renderLearnView(container) -> cleanup function
 *     Builds the whole page inside `container` (the empty #view element given
 *     by router.js). The page has nothing to stop (no timers, no async work),
 *     but it still returns a cleanup function so every view follows the same
 *     contract: export function renderXxxView(container) { ...; return cleanup; }
 *
 *  BEHAVIOUR NOTES
 *  ---------------
 *  - The jump buttons use scrollIntoView and then move keyboard focus to the
 *    section heading. They are buttons, NOT in-page "#section" links, because
 *    the router is hash based (#/forgery, ...) and a "#section" link would
 *    change the hash and trigger a route change.
 *  - Smooth scrolling is turned off when the user prefers reduced motion.
 *  - Links to the labs are plain hash links (see ROUTES below). They need no
 *    JavaScript: the router already listens to hashchange.
 *  - The comparison table has a caption, column headers and row headers
 *    (scope="col" / scope="row") so a screen reader can read it cell by cell.
 *  - The worked example is wrapped in try/catch; if a core function ever
 *    throws, the example shows a short note and the rest of the page is fine.
 *  - Everything is built with createElement/textContent (no innerHTML).
 *
 *  ACCURACY NOTES (worth knowing for the viva)
 *  -------------------------------------------
 *  - Text on this page follows standard textbook wording for hash functions.
 *    I have NOT seen the text of your slides, so please compare the wording
 *    of sections 1 to 3 with Slides 1, 4 and 5 and edit the CONTENT arrays at
 *    the top of this file to match your presentation exactly.
 *  - The "wasted bits on ASCII" row is stated carefully: the 112-of-128 result
 *    is for the plain XOR hash. For RXOR the rotation moves the always-zero
 *    bits around, so the same fixed-bit pattern does not appear in the hash.
 *
 *  ASSUMPTIONS ABOUT YOUR OTHER FILES (please check)
 *  -------------------------------------------------
 *    - Routes are #/visualizer, #/forgery, #/analyzer and #/collision. They
 *      are collected in ROUTES; change them there if router.js uses
 *      different paths.
 *    - xorHash / rxorHash(bytes, blockBytes) are synchronous and use zero
 *      padding with no length block (the default).
 *
 *  CSS CLASSES (style them in css/components.css and css/layout.css)
 *  -----------------------------------------------------------------
 *    .learn-view  .learn-intro  .learn-nav  .learn-section  .learn-section-intro
 *    .learn-grid  .learn-card  .learn-card-title  .learn-formula  .learn-list
 *    .learn-table  .learn-table-wrap  .learn-link  .learn-example
 *
 *  USED BY : js/ui/router.js (route #/learn)
 *  DEPENDS : core/config.js, core/bitUtils.js, core/xorHash.js,
 *            core/rxorHash.js
 * ============================================================================
 */
import { textToBytes, bytesToBinaryString, bytesToHex } from '../core/bitUtils.js';
import { xorHash } from '../core/xorHash.js';
import { rxorHash } from '../core/rxorHash.js';

// ---------------------------------------------------------------------------
// Routes (change here if router.js uses different paths)
// ---------------------------------------------------------------------------

const ROUTES = {
  visualizer: '#/visualizer',
  forgery: '#/forgery',
  analyzer: '#/analyzer',
  collision: '#/collision',
};

// ---------------------------------------------------------------------------
// CONTENT (edit the wording here to match your slides)
// ---------------------------------------------------------------------------

const WHAT_IS = {
  formula: 'h = H(M)',
  paragraphs: [
    'A hash function H takes a message M of any length and produces a short, fixed-size value h, called the ' +
      'hash value, hash code or message digest.',
    'Think of it as a fingerprint of the message. The same message always gives the same hash, and a tiny ' +
      'change to the message should give a very different one.',
    'Because messages have any length, the message is first padded to a multiple of the block size and cut ' +
      'into n-bit blocks. Some designs also append the length of the message in bits, so that a message and ' +
      'the same message with trailing zeros do not look identical.',
    'Only the hash needs protecting. If the hash is kept safe, any change to the message can be spotted by ' +
      'recomputing the hash and comparing. That is exactly the assumption the Forgery Lab attacks.',
  ],
  link: { label: 'See the pipeline step by step', href: ROUTES.visualizer },
};

const PROPERTIES = [
  {
    name: 'Variable input size',
    text: 'H can be applied to a message of any length.',
    lab: null,
  },
  {
    name: 'Fixed output size',
    text: 'H always produces an output of the same length (n bits).',
    lab: null,
  },
  {
    name: 'Efficiency',
    text: 'H(M) is easy to compute for any message M.',
    lab: null,
  },
  {
    name: 'Preimage resistance (one-way)',
    text: 'Given a hash value h, it is infeasible to find any M with H(M) = h.',
    lab: { label: 'XOR and RXOR fail this in the Forgery Lab', href: ROUTES.forgery },
  },
  {
    name: 'Second-preimage resistance (weak collision resistance)',
    text: 'Given a message M, it is infeasible to find a different M\' with H(M\') = H(M).',
    lab: { label: 'Broken by appending a block', href: ROUTES.forgery },
  },
  {
    name: 'Collision resistance (strong)',
    text: 'It is infeasible to find any two different messages with the same hash.',
    lab: { label: 'Race the three hashes in the Collision Lab', href: ROUTES.collision },
  },
  {
    name: 'Pseudorandom output',
    text: 'The output looks random, and flipping one input bit changes about half of the output bits ' +
      '(the avalanche effect).',
    lab: { label: 'Measure it in the Avalanche test', href: ROUTES.collision },
  },
];

const APPLICATIONS = [
  {
    name: 'Message authentication',
    text: 'The sender sends the message plus a protected hash. The receiver recomputes the hash and compares. ' +
      'This is the setting of the Forgery Lab.',
  },
  {
    name: 'Digital signatures',
    text: 'Instead of signing a long message, the sender signs its short hash with a private key. ' +
      'Anyone can recompute the hash and verify the signature.',
  },
  {
    name: 'Password storage',
    text: 'A system stores H(password) rather than the password itself, so a stolen database does not reveal ' +
      'the passwords directly.',
  },
  {
    name: 'File integrity',
    text: 'A published checksum lets you check that a downloaded file arrived unchanged.',
  },
  {
    name: 'Intrusion and virus detection',
    text: 'Store the hash of every important file. If a file\'s hash changes later, something modified it.',
  },
  {
    name: 'Other uses',
    text: 'Pseudorandom number generation, key derivation, and linking blocks together in a blockchain.',
  },
];

const COMPARISON = {
  caption: 'XOR, RXOR and SHA-256 compared',
  columns: ['', 'XOR hash', 'RXOR hash', 'SHA-256'],
  rows: [
    [
      'Formula',
      'h = B1 ⊕ B2 ⊕ … ⊕ Bm',
      'h = ROL1(h) ⊕ Bi, starting at h = 0',
      'Chain of a 64-round compression function over 512-bit blocks',
    ],
    ['Does block order matter?', 'No', 'Yes', 'Yes'],
    [
      'Collision by swapping two blocks',
      'Always works (XOR is commutative)',
      'Fails, the rotation depends on position',
      'No known shortcut',
    ],
    [
      'Forgery by appending a correcting block',
      'Works: X = S ⊕ T',
      'Works: X = ROL1(h\') ⊕ T',
      'Not possible',
    ],
    [
      'Flip one input bit',
      'Exactly 1 output bit changes',
      'Exactly 1 output bit changes (rotation only moves it)',
      'About 50% of the output bits change',
    ],
    [
      'Predictable ASCII text',
      'Bit 7 of every byte is 0, so 16 of 128 hash bits never change (112 effective)',
      'Rotation moves the zero bits around, so the same fixed-bit pattern does not appear',
      'No fixed bits',
    ],
    [
      'Linear in the input?',
      'Yes',
      'Yes',
      'No',
    ],
    [
      'Verdict',
      'Insecure',
      'Insecure',
      'Secure for practical use',
    ],
  ],
};

const LIMITS = [
  {
    name: 'Forgery by appending a block',
    text: 'XOR and RXOR are linear, so an attacker can solve for one extra block that steers the hash to any ' +
      'target value. The rotation in RXOR does not stop this.',
    link: { label: 'Try it in the Forgery Lab', href: ROUTES.forgery },
  },
  {
    name: 'Collisions by swapping blocks',
    text: 'Swapping two blocks of an XOR-hashed message keeps the hash. RXOR blocks that trick, but not the ' +
      'forgery above, so collisions are still instant.',
    link: { label: 'Find collisions in the Collision Lab', href: ROUTES.collision },
  },
  {
    name: 'No avalanche effect',
    text: 'One flipped input bit flips exactly one output bit. Small, local, predictable changes are what ' +
      'make the attacks possible.',
    link: { label: 'Flip a bit in the Avalanche test', href: ROUTES.collision },
  },
  {
    name: 'Predictable data wastes bits',
    text: 'Plain ASCII text always has a 0 in its highest bit. In a 128-bit XOR hash made of 16 byte columns, ' +
      '16 bits never change, leaving 112 effective bits. The chance of an undetected error rises from ' +
      '2^-128 to 2^-112.',
    link: { label: 'Analyse real text in the Analyzer', href: ROUTES.analyzer },
  },
  {
    name: 'Even a perfect hash has a birthday limit',
    text: 'For an ideal n-bit hash, a collision needs only about 2^(n/2) tries. That is why short hashes are ' +
      'weak, and why SHA-256 (about 2^128 tries) stays safe.',
    link: { label: 'Watch the birthday search', href: ROUTES.collision },
  },
];

const NAV = [
  { id: 'what', label: 'What is a hash?' },
  { id: 'properties', label: 'Properties' },
  { id: 'applications', label: 'Applications' },
  { id: 'compare', label: 'XOR vs RXOR' },
  { id: 'limits', label: 'Security limits' },
  { id: 'example', label: 'Worked example' },
];

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeLink(link) {
  const a = el('a', 'learn-link', link.label);
  a.href = link.href;
  return a;
}

function makeCard(heading, bodyText, link) {
  const card = el('article', 'learn-card');
  card.append(el('h4', 'learn-card-title', heading));
  if (bodyText) card.append(el('p', null, bodyText));
  if (link) card.append(makeLink(link));
  return card;
}

/** A section with a heading that can receive focus when jumped to. */
function makeSection(id, headingText, introText) {
  const section = el('section', 'learn-section');
  section.dataset.section = id;
  const heading = el('h3', null, headingText);
  heading.tabIndex = -1;
  section.append(heading);
  if (introText) section.append(el('p', 'learn-section-intro', introText));
  return { section, heading };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildWhatIs() {
  const { section, heading } = makeSection('what', 'What is a hash function?');
  section.append(el('p', 'learn-formula', WHAT_IS.formula));
  for (const text of WHAT_IS.paragraphs) section.append(el('p', null, text));
  section.append(makeLink(WHAT_IS.link));
  return { section, heading };
}

function buildProperties() {
  const { section, heading } = makeSection(
    'properties',
    'Properties of a good hash function',
    'A hash used for security needs all of these. The labs show which ones XOR and RXOR lose.',
  );
  const grid = el('div', 'learn-grid');
  for (const p of PROPERTIES) grid.append(makeCard(p.name, p.text, p.lab));
  section.append(grid);
  return { section, heading };
}

function buildApplications() {
  const { section, heading } = makeSection(
    'applications',
    'Applications',
    'Hash functions appear almost everywhere in security.',
  );
  const grid = el('div', 'learn-grid');
  for (const a of APPLICATIONS) grid.append(makeCard(a.name, a.text));
  section.append(grid);
  return { section, heading };
}

function buildComparison() {
  const { section, heading } = makeSection(
    'compare',
    'XOR vs RXOR vs SHA-256',
    'RXOR rotates before each XOR, which fixes one weakness of XOR but not the others.',
  );

  const wrap = el('div', 'learn-table-wrap');
  const table = el('table', 'learn-table');
  table.append(el('caption', null, COMPARISON.caption));

  const thead = el('thead');
  const headRow = el('tr');
  COMPARISON.columns.forEach((name, i) => {
    const th = el('th', null, i === 0 ? 'Property' : name);
    th.scope = 'col';
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);

  const tbody = el('tbody');
  for (const row of COMPARISON.rows) {
    const tr = el('tr');
    const rowHeader = el('th', null, row[0]);
    rowHeader.scope = 'row';
    tr.append(rowHeader);
    for (let i = 1; i < row.length; i += 1) tr.append(el('td', null, row[i]));
    tbody.append(tr);
  }
  table.append(tbody);

  wrap.append(table);
  section.append(wrap);
  return { section, heading };
}

function buildLimits() {
  const { section, heading } = makeSection(
    'limits',
    'Why XOR and RXOR are insecure',
    'Each weakness below is something you can see and click in the labs.',
  );
  const grid = el('div', 'learn-grid');
  for (const l of LIMITS) grid.append(makeCard(l.name, l.text, l.link));
  section.append(grid);
  return { section, heading };
}

/** "HI" and "IH" with 1-byte blocks, calculated with the real hash code. */
function buildExample() {
  const { section, heading } = makeSection(
    'example',
    'Worked example: "HI" and "IH"',
    'Block size 1 byte, so "HI" is two blocks: 01001000 and 01001001.',
  );

  const box = el('div', 'learn-example');
  try {
    const hi = textToBytes('HI');
    const ih = textToBytes('IH');
    const rows = [
      ['XOR("HI")', xorHash(hi, 1)],
      ['XOR("IH")', xorHash(ih, 1)],
      ['RXOR("HI")', rxorHash(hi, 1)],
      ['RXOR("IH")', rxorHash(ih, 1)],
    ];

    const table = el('table', 'learn-table learn-example-table');
    table.append(el('caption', null, 'Hashes of HI and IH under XOR and RXOR'));
    const thead = el('thead');
    const headRow = el('tr');
    for (const name of ['Hash', 'Binary', 'Hex']) {
      const th = el('th', null, name);
      th.scope = 'col';
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = el('tbody');
    for (const [label, hash] of rows) {
      const tr = el('tr');
      const th = el('th', null, label);
      th.scope = 'row';
      tr.append(th, el('td', null, bytesToBinaryString(hash)), el('td', null, bytesToHex(hash)));
      tbody.append(tr);
    }
    table.append(tbody);
    box.append(table);

    box.append(
      el(
        'p',
        'learn-note',
        'XOR gives the same hash for both orders, so order does not matter and swapping blocks is a free ' +
          'collision. RXOR gives different hashes, so order matters. These numbers are computed live by the ' +
          'same code the labs use.',
      ),
    );
  } catch (err) {
    box.append(el('p', 'learn-note', 'The live example is unavailable right now.'));
  }

  section.append(box);
  return { section, heading };
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function renderLearnView(container) {
  const root = el('section', 'learn-view');

  root.append(
    el('h2', null, 'Learn'),
    el(
      'p',
      'learn-intro',
      'The theory behind the labs: what a hash is, what makes one good, and why XOR and RXOR fail.',
    ),
  );

  const built = {
    what: buildWhatIs(),
    properties: buildProperties(),
    applications: buildApplications(),
    compare: buildComparison(),
    limits: buildLimits(),
    example: buildExample(),
  };

  // ----- jump buttons (not "#section" links: the router is hash based) -----
  const nav = el('nav', 'learn-nav');
  nav.setAttribute('aria-label', 'Jump to a section of this page');
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const item of NAV) {
    const btn = el('button', 'btn btn-secondary', item.label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const target = built[item.id];
      if (!target) return;
      target.section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      target.heading.focus({ preventScroll: true });
    });
    nav.append(btn);
  }

  root.append(nav);
  for (const item of NAV) root.append(built[item.id].section);

  container.replaceChildren(root);

  // Nothing to stop: no timers and no async work on this page.
  return function cleanup() {};
}