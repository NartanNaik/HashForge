<!--
  File    : docs/architecture.md
  Project : Hash Forge

  WHAT THIS FILE DOES
  Explains how the code is organised: the layers, the data flow, the rules
  every file follows, and why the main design decisions were made. Written
  from the header comments of the real source files.
-->

# Hash Forge: Architecture

## 1. The big picture

Hash Forge runs entirely in the browser. There is no backend and no database.
The code is split into layers. Each layer may only use the layers below it.

```
        index.html  (page shell, navbar, <main id="view">)
             |
          js/main.js        theme, error safety net, environment checks
             |
        js/ui/router.js     hash router (#/forgery ...), loads views lazily
             |
   +---------+------------------------------------------+
   |   VIEWS (DOM code lives ONLY here)                  |
   |   visualizerView  forgeryView  analyzerView         |
   |   collisionView   learnView                         |
   |   components: bitGrid  hashCard  toast              |
   +---------+------------------------------------------+
             |                         |
   js/attacks/                   js/charts/charts.js
     forgery.js                    (Chart.js wrappers)
     collision.js
     avalanche.js
             |
   js/analysis/bitAnalyzer.js
             |
   js/core/   (the hash engine, pure logic, no DOM)
     bitUtils.js  padding.js  xorHash.js  rxorHash.js
     sha256.js    config.js
```

Rule: **core -> attacks / analysis -> ui**. A lower layer never imports from a
higher one, and only the `ui` folder touches the DOM. This is why the whole
hash and attack logic can be unit-tested in plain Node, without a browser.

## 2. Data flow (example: Forgery Lab)

1. The user types the original message, the forged message, picks XOR or RXOR
   and a block size in `forgeryView.js`.
2. The view turns text into bytes with `textToBytes()` (`bitUtils.js`).
3. The view computes the target hash T with `xorHash()` or `rxorHash()`.
4. The view calls `forgeXor()` or `forgeRxor()` (`attacks/forgery.js`):
   - zero-pads the forged message to a block boundary,
   - computes the correcting block (`X = S ^ T` for XOR, `X = ROL1(h') ^ T`
     for RXOR),
   - appends it and **re-hashes with the real hash function** as a self-check.
5. The view recomputes the final hash again by itself. The green
   "HASHES MATCH" banner is shown only if both checks agree.
6. `sha256()` hashes the original and the forged message to show that
   SHA-256 gives completely different values (about half the bits differ).
7. `bitGrid` and `hashCard` draw the blocks and hashes. Errors are shown by
   `toast.error(err)`.

The other labs follow the same pattern: collect input -> call logic -> draw.

## 3. Modules and the slides they prove

| Module | View file | Logic files | Slides |
|---|---|---|---|
| 1. Hash Visualizer | `visualizerView.js` | `padding.js`, `xorHash.js`, `rxorHash.js` (the `...Steps` functions) | 2, 3, 6, 8, 9 |
| 2. Forgery Attack Lab | `forgeryView.js` | `attacks/forgery.js`, `sha256.js` | 10 |
| 3. Predictable-Data Analyzer | `analyzerView.js` | `analysis/bitAnalyzer.js` | 3 |
| 4. Collision and Avalanche Lab | `collisionView.js` | `attacks/collision.js`, `attacks/avalanche.js`, `charts/charts.js` | 7, 9 |
| 5. Learn Panel | `learnView.js` | `xorHash.js`, `rxorHash.js` (live worked example) | 1, 4, 5 |

## 4. Conventions every file follows

**View contract.** Every view exports
`renderXxxView(container) -> cleanup`. The router passes the empty `#view`
element and calls the returned cleanup before leaving the page. Cleanup stops
timers, cancels the birthday search (`AbortController`) and destroys charts.

**No `innerHTML`.** DOM is built with `createElement` and `textContent`, so
text typed by the user can never inject HTML.

**Inputs are never modified.** Every helper returns new arrays.

**Plain zero padding by default.** `xorHash`, `rxorHash`, `forgery.js` and
`collision.js` all pad with zero bytes and add no length block
(`appendLength = false`). The forgery maths matches the real hash functions
exactly. The length field of Slide 2 is available only for the visualizer demo.

**Hash size = block size.** The hash is one block wide, so a 16-bit demo block
gives a 16-bit hash (short enough to read and verify on screen).

**Two bit-numbering conventions, on purpose.**
- `flipBit(bytes, index)` and the bit grid's click index: 0 is the leftmost bit
  of the first byte (reads like the binary strings on the slides).
- `bitAnalyzer.js` positions inside one byte: 7 is the leftmost
  (highest-order) bit, because the slides call it the "highest-order bit".
  `bitGrid` converts between the two (`column = 7 - position`).

**Never trust a result, re-check it.** The views recompute hashes with the
real hash functions instead of trusting what an attack returned, so a wrong
forgery can never be displayed as a success.

## 5. Routing

Hash based: `#/visualizer`, `#/forgery`, `#/analyzer`, `#/collision`,
`#/learn`. No server and no page reload, and every demo has a shareable link.
Views are loaded with dynamic `import()` the first time they are visited, so a
broken file breaks only its own page. A run token ignores a slow earlier load
if the user clicks tabs quickly.

## 6. Styling

| File | Purpose |
|---|---|
| `css/base.css` | Colour tokens (dark and light), fonts, spacing, reset, focus ring |
| `css/layout.css` | Sticky header, page grid, result grids, breakpoints (projector scaling) |
| `css/components.css` | Buttons, inputs, bit cells, hash card, toasts, every view element |
| `css/animations.css` | All keyframes, match/mismatch pulse, reduced-motion switch |

Meaning is never carried by colour alone: states also use text, icons,
outlines (changed bits) or dashes (fixed bits).

## 7. Testing

`npm test` runs `node --test tests/`. The tests cover the pure logic only:
`xorHash`, `rxorHash`, `forgery`, `collision` and `bitAnalyzer`. The forgery
test checks, for 50 random messages and targets at every block size, that
`hash(forged) === target` for both XOR and RXOR. Views are checked by hand
using the demo script.

`package.json` must contain `"type": "module"` so Node treats the `.js` files
as ES modules.

## 8. Why these choices

- **No framework.** Every teammate can read every file.
- **No backend.** Free hosting, and the demo is only a link.
- **Web Crypto for SHA-256.** We do not implement SHA-256 ourselves. The
  browser's built-in `crypto.subtle.digest` is fast and correct. It needs
  https or `http://localhost` (a secure context). `main.js` warns before the
  demo if it is missing.
- **Chart.js from a CDN.** Loaded before `main.js` as the global `Chart`.
- **Truncated SHA-256 for the birthday demo.** Full SHA-256 collisions need
  about 2^128 work, so we show the same attack only on 8 to 32 bits.

## 9. Known limitations

- Each view keeps its own message and block size. Nothing is shared between
  labs (a shared store was left out on purpose).
- A chart reads theme colours when drawn, so after a theme change run the
  trials or sweep again to redraw it.
- The appended forgery block is arbitrary bytes and may show as unreadable
  characters. The UI shows it in hex.