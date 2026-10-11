# Hash Forge: Complete User Guide

*Break XOR. See SHA-256 resist.*

---

## How to use this guide

Every tab of the site has its own chapter. Each chapter has the same parts:

1. **Purpose**: why the tab exists
2. **Theory**: the idea behind it
3. **Controls**: every button and field
4. **Walkthrough**: what to click and what you should see
5. **Reading the output**: what each result means and why it appears
6. **Under the hood**: how the code produces it
7. **Exercises**: real-life tasks to test yourself

Chapters 1 to 3 give the background. Chapters 4 to 8 cover the five tabs in the same order as the top bar. Chapter 9 covers the internals, and the last chapters hold limitations, troubleshooting, a glossary and a viva cheat sheet.

> **A note on exact wording.** Button and label names below follow what the site shows. Where a result appears only after a click (for example the Forgery result panel), I describe it from the program's logic and its tests, so a label may differ slightly from yours. The numbers will match.

---

## Contents

1. What Hash Forge is, and why it exists
2. Getting started
3. Theory primer
4. Tab 1: Hash Visualizer
5. Tab 2: Forgery Attack Lab
6. Tab 3: Predictable-Data Analyzer
7. Tab 4: Collision and Avalanche Lab
8. Tab 5: Learn
9. How it works internally
10. Master exercise set
11. Honest limitations
12. Troubleshooting
13. Glossary
14. Viva cheat sheet

---

# 1. What Hash Forge is, and why it exists

## The problem

A **hash function** squeezes any message into a short, fixed-size fingerprint called a hash (or digest). Systems use it to detect tampering: the sender transmits the message and protects only the hash, perhaps by encrypting it. The receiver recomputes the hash and compares. If they match, the message is trusted.

That only works if it is **practically impossible to change a message without changing its hash**. Two simple hash designs, **XOR** and **RXOR**, look reasonable but fail this test badly.

## The purpose of the project

Hash Forge turns the claims from the presentation into things you can click:

- XOR and RXOR hashes can be **forged**: change the message, keep the hash.
- XOR hashes have **instant collisions**: two different messages, one hash.
- Both have **no avalanche effect**: one flipped input bit flips only one output bit.
- Normal text **wastes bits**: a 128-bit XOR hash of English text has only 112 usable bits.
- **SHA-256**, a real hash, resists all of these.

The one-line pitch: *"We don't just tell you XOR and RXOR hashes are insecure. We break them live, and show a real hash resisting the same attacks."*

## What it is built from

| Part | Choice |
|---|---|
| Language | HTML5, CSS3, vanilla JavaScript (ES modules) |
| SHA-256 | Web Crypto API (`crypto.subtle.digest`) |
| Charts | Chart.js (loaded from a CDN) |
| Tests | Node's built-in runner (`node --test`), 117 tests |
| Server | None. Everything runs in your browser |

---

# 2. Getting started

## Running the site

ES modules do not load from `file://`, so serve the folder over http:

```
npx serve
```

or use VS Code's **Live Server**. Then open the address it prints (usually `http://localhost:3000` or `http://127.0.0.1:5500`).

Once deployed to GitHub Pages or Netlify, the demo is just a link.

## Requirements

- A modern browser (Chrome, Edge, Firefox, Safari).
- An internet connection **only** for the Chart.js CDN. If you are offline, the charts will not draw but everything else works.
- A **secure context** for SHA-256. `crypto.subtle` works on `localhost` and on `https://` pages, but not on a plain `http://` address on another machine (for example `http://192.168.x.x`).

## The layout

- **Top bar:** logo with the tagline, then five tabs: **Visualizer, Forgery, Analyzer, Collision, Learn**.
- **Sun icon (top right):** switches between dark and light themes. Use dark on a projector.
- **Main area:** the active tab. The tabs are routed by the address (`#/visualizer`, `#/forgery`, `#/analyzer`, `#/collision`, `#/learn`), so you can bookmark or share a link straight to one tab.

---

# 3. Theory primer

Read this once. Every tab depends on it.

## 3.1 Hash function

A hash function **H** maps a message **M** of any length to a fixed-size value **h = H(M)**.

A hash used for security should have these properties. The Learn tab lists them as cards, and each card links to the lab that tests it:

| Property | Meaning | Which lab shows XOR/RXOR failing it |
|---|---|---|
| Variable input size | H accepts any length | (always true) |
| Fixed output size | Output is always n bits | (always true) |
| Efficiency | Easy to compute | (always true) |
| **Preimage resistance** (one-way) | Given h, infeasible to find any M with H(M) = h | Forgery Lab |
| **Second-preimage resistance** | Given M, infeasible to find M' ≠ M with H(M') = H(M) | Forgery Lab (appending a block) |
| **Collision resistance** | Infeasible to find any two messages with the same hash | Collision Lab |
| **Pseudorandom output** | Looks random; a tiny input change flips about half the output bits | Avalanche test |

## 3.2 Bits, bytes, blocks, hex

- A **byte** is 8 bits. The **hash size** in this site equals the **block size**, so a 16-bit block gives a 16-bit hash.
- **Hex** is a compact way to write bytes: two hex digits per byte. `299e` is the two bytes `0x29` and `0x9e`, which is `00101001 10011110` in binary.
- Bits inside a byte are numbered **bit 0 (rightmost) to bit 7 (leftmost)**. Bit 7 is the *highest-order bit*.

## 3.3 Encoding: text to bytes

The site converts text to bytes with **UTF-8**:

- Plain English letters, digits and punctuation are **1 byte** each, with bit 7 equal to 0. `H` is `01001000`.
- Other characters take **2 to 4 bytes**, and every one of those bytes has bit 7 equal to 1 (for example `₹` is 3 bytes, `E2 82 B9`).

This matters in two places: the Forgery Lab's byte counts ("18 bytes" for `Pay ₹100 to Ravi`, where `₹` costs 3 bytes) and the Analyzer's high-bit result.

## 3.4 Padding and blocks

The message is cut into blocks of **n bits**. If the last block is short, it is **padded with zero bytes** until it is full.

Some designs also **append the length of the message in bits** as one more block. Without this, `HI` and `HI` followed by zero bytes would look identical after padding. This is the "Append the length of M (Slide 2)" checkbox in the Visualizer.

## 3.5 The XOR hash

```
h = B1 ⊕ B2 ⊕ … ⊕ Bm
```

XOR every block together. In bits: output bit is 1 when an odd number of input bits are 1.

Three properties of XOR drive every attack:

- **Commutative:** `A ⊕ B = B ⊕ A`, so **order does not matter**.
- **Self-cancelling:** `A ⊕ A = 0`, and `A ⊕ 0 = A`.
- **Linear:** `hash(A) ⊕ hash(B) = hash(A ⊕ B)` for equal-length data.

Worked slide example, 8-bit blocks, message `HI`:

```
H = 01001000
I = 01001001
H ⊕ I = 00000001
```

## 3.6 The RXOR hash

```
h = 0
for each block Bi:
    h = ROL1(h) ⊕ Bi
```

`ROL1` is a **circular left rotation by one bit across the whole n-bit value**: every bit moves one place left and the leftmost bit wraps around to the right. Example for 16 bits: `0x8000` rotates to `0x0001`.

Rotating before each XOR makes block **order matter**. It also makes earlier blocks rotate more times than later blocks.

Worked example, 8-bit blocks:

| Message | Steps | Hash |
|---|---|---|
| `HI` | h=0 → ROL1(0)⊕H = `01001000` → ROL1 = `10010000` ⊕ `01001001` | `11011001` (`D9`) |
| `IH` | ROL1(0)⊕I = `01001001` → ROL1 = `10010010` ⊕ `01001000` | `11011010` (`DA`) |

## 3.7 SHA-256

SHA-256 is a standard hash with a 256-bit output. It chops the message into 512-bit blocks and runs each through a 64-round compression function. Those rounds are **non-linear**, so a one-bit change spreads through the whole state. There is **no known shortcut** for forging or colliding it. The site calls it through the browser's Web Crypto API.

## 3.8 The attacks, in one table

| Attack | Idea | Works on XOR | Works on RXOR | Works on SHA-256 |
|---|---|---|---|---|
| **Forgery by appending a block** | Add one block that cancels the difference | Yes | Yes | No |
| **Collision by swapping blocks** | Exchange two blocks | Yes | No (rotation breaks it) | No |
| **Avalanche weakness** | One input bit changes one output bit | Yes | Yes | No (about 50% change) |
| **Predictable data** | Bit 7 of ASCII is always 0 | Yes | Rotation spreads the fixed bit | No fixed bits |
| **Birthday attack** | Brute-force collisions in about 2^(n/2) tries | Not needed | Not needed | Only on a *truncated* hash |

---

# 4. Tab 1: Hash Visualizer

## Purpose

Show **how a hash is built**, one stage at a time, so the later attacks make sense. It covers slides 2, 3, 6, 8 and 9 of the presentation.

## Theory

The pipeline is: **text → ASCII codes → binary → padding → blocks → running hash → final hash.** The hash is computed by folding the blocks one at a time: XOR with the running value (XOR hash) or rotate-then-XOR (RXOR hash).

## Controls

| Control | Options | Meaning |
|---|---|---|
| **Message** | any text | Default `HELLO WORLD` |
| **Block size** | 8, 16, 32, 64, 128 bits (default 16 bits = 2 bytes) | Block size and also the hash size |
| **Algorithm** | XOR, RXOR, Both | **Both** shows the two side by side |
| **Speed** | e.g. Normal (700 ms per step) | Animation pace |
| **Append the length of M (Slide 2)** | checkbox | Adds the message length in bits as an extra block |
| **Reset** | button | Clears the animation (disabled until you start) |
| **Back** | button | Goes back one stage |
| **Play** | button | Animates automatically (becomes Pause while running) |
| **Step** | button | Advances one stage per click |
| **Skip to end** | button | Jumps to the final result |
| Progress bar and status line | | Shows "Ready. Press Play or Step to begin." and then the current stage |

A blue **Tip** box reminds you: choose 8-bit blocks and type `HI` to reproduce the slide example.

## Walkthrough 1: the slide example

1. Type `HI`.
2. Set **Block size** to **8 bits (1 byte)**.
3. Leave **Algorithm** as **XOR**.
4. Click **Step** repeatedly (or **Play**).

You should see these stages:

1. **Text:** `HI`
2. **ASCII codes:** `H = 72`, `I = 73`
3. **Binary:** `01001000` and `01001001`
4. **Padding:** none needed (both blocks are full)
5. **Blocks:** block 1 = `01001000`, block 2 = `01001001`
6. **Running hash:** start `00000000`, then `01001000`, then `01001000 ⊕ 01001001 = 00000001`
7. **Final hash:** `00000001` (hex `01`)

## Walkthrough 2: XOR ignores order, RXOR does not

1. Set **Algorithm** to **Both**, block size 8 bits, message `HI`, and play to the end. XOR gives `01`, RXOR gives `D9`.
2. Change the message to `IH` and play again. XOR still gives `01`, but RXOR now gives `DA`.

## Reading the output and why

- **Same XOR hash for `HI` and `IH`:** XOR is commutative, so a different order gives the same result. This is the weakness that the block-swap collision later exploits.
- **Different RXOR hashes:** the rotation happens between blocks, so the first block is rotated one more time than the second. Order is now baked into the hash. That is the whole point of RXOR, and the reason swapping fails to forge it.
- **Zero padding:** `ABC` with 2-byte blocks becomes `AB` and `C\0`, so the last block is `0x4300`. The hash is `0x4142 ⊕ 0x4300 = 0x0242`.
- **Append length:** `HI` with 2-byte blocks is a single block `0x4849`. With the length option, an extra block holding the length in bits (`16 = 0x0010`) is XORed in, giving `0x4849 ⊕ 0x0010 = 0x4859`.

## Under the hood

- `padding.js`: `padToBlockSize(bytes, blockBytes)` adds zero bytes and, if asked, the length block. `splitIntoBlocks(bytes, blockBytes)` returns the array of blocks.
- `xorHash.js` / `rxorHash.js`: `xorHash` and `rxorHash` return the final hash. `xorHashSteps` and `rxorHashSteps` return **every intermediate state** (the block and the running value), which the animation plays back.
- `bitUtils.js`: `textToBytes`, `bytesToBinaryString`, `bytesToHex`, `xorBytes`, `rotateLeft1`.
- `visualizerView.js` builds the stages and `bitGrid.js` draws the coloured bit cells. The hash code has no DOM access, so the visualizer never alters the maths. The tests guarantee that the step-by-step result equals the direct hash.

An empty message gives an all-zero hash of block size. A one-block message gives the same result under XOR and RXOR.

## Exercises

1. **Reproduce the slide.** `HI`, 8-bit blocks, XOR. Confirm `00000001`.
2. **Padding.** `ABC`, 2-byte blocks. Predict the padded blocks, then check the hash is `0242`. Change to 1-byte blocks: no padding, hash `40`.
3. **Rotation by hand.** `ABC`, 1-byte blocks, RXOR. Predict `C2` (A=`41`; ROL1(`41`)=`82` ⊕ `42` = `C0`; ROL1(`C0`)=`81` ⊕ `43` = `C2`), then check the result.
4. **Cancel to zero.** Type `ABAB` with 1-byte blocks and see the XOR hash is `00`. A message repeated twice always XORs to zero.
5. **Length option.** `HI` with 2-byte blocks, with and without the checkbox. Explain why the results differ (`4849` vs `4859`).
6. **Real life.** Take your own name. Hash it with XOR and RXOR using 8-bit blocks, then reverse the letters. Which algorithm notices the change?

---

# 5. Tab 2: Forgery Attack Lab

## Purpose

This is the **main demonstration** (slide 10). It shows that an attacker who knows a message and its hash can write a different message and compute **one extra block** that makes the forged message hash to exactly the same value.

## Theory

**The setting.** The message travels in plaintext and only its hash is protected, for example by encryption. The attacker can change the plaintext but cannot change the protected hash. So the attacker needs a forged message with the **same hash as the original**.

**XOR forgery.** The target is T = XOR hash of the original.

1. Pad the forged message to full blocks.
2. Compute `S` = XOR of all the forged blocks.
3. Append the block `X = S ⊕ T`.
4. The new hash is `S ⊕ X = S ⊕ S ⊕ T = T`. 

**RXOR forgery.** The target is T.

1. Pad the forged message and hash it with RXOR to get `h'`.
2. Append `X = ROL1(h') ⊕ T`.
3. One more RXOR step gives `ROL1(h') ⊕ X = ROL1(h') ⊕ ROL1(h') ⊕ T = T`. 

**Why rotation does not save RXOR:** rotation breaks the "swap blocks" trick (the Collision Lab), but the attacker only has to solve **one equation for one unknown block**, and XOR makes that equation trivial to solve. It is linear algebra, not guessing.

## Controls

| Control | Meaning |
|---|---|
| **Scenario** dropdown | Preloads example messages such as "Pay ₹100 → ₹10,000" |
| **Algorithm** | XOR or RXOR |
| **Block size = hash size** | e.g. 16 bits (2 bytes) |
| **Panel 1: Original message** | The message the sender signs. Shows its byte and block count, and its hash (hex and binary, with a **Copy** button) |
| **Panel 2: Attacker's forged message** | Editable. Shows the byte count and how much padding it will get |
| **Panel 3: Result** | The **Forge it** button and the outcome |

## Walkthrough (the default scenario)

1. Open **Forgery**. The scenario is **Pay ₹100 → ₹10,000**, the algorithm is **XOR**, the block size is **16 bits**.
2. **Panel 1** shows `Pay ₹100 to Ravi`: *18 bytes, 9 blocks of 16 bits*, and the XOR hash **`299e`** (`00101001 10011110`). Remember `₹` is 3 bytes in UTF-8.
3. **Panel 2** shows `Pay ₹10,000 to Ravi`: *21 bytes, will get 1 zero byte of padding, then one 16-bit correcting block.*
4. Click **Forge it**.

For this scenario the result should be:

- The forged message padded to 22 bytes (11 blocks).
- XOR of its blocks: `0x1E85`.
- **Correcting block** `X = 1E85 ⊕ 299E = 371B` (binary `00110111 00011011`).
- Final message: the forged text, one zero byte, then `37 1B`.
- Final hash: `1E85 ⊕ 371B = 299E`, which **equals the target**.
- A green **"HASHES MATCH ✔"** indicator.

5. Switch **Algorithm** to **RXOR** and click **Forge it** again. It matches again with a different correcting block.
6. Read the **SHA-256 comparison** below the result: the original and the forged message give two completely unrelated SHA-256 hashes.

## Reading the output and why

| Output | Meaning |
|---|---|
| **Padding added** | Zero bytes needed to fill the last forged block (1 in the example) |
| **Appended block** (hex and binary) | The correcting block `X`. It is arbitrary bytes, so it is shown in hex and not as text |
| **Final message** | Forged text + padding + correcting block |
| **Final hash vs target** | Equal. The page runs this check itself and shows the green or red state |
| **SHA-256 of both** | Completely different. The same trick fails because SHA-256 is non-linear |

**Why the appended block looks like garbage:** `371B` is not printable text. In a real attack it could be hidden, for example in a comment field, an unused field, or trailing data. The lab states this limitation openly.

**Why the hash is unchanged while the message changed:** the extra block carries exactly the difference between the forged message's running hash and the target.

## Under the hood

- `forgery.js`: `forgeXor(forgedMsgBytes, targetHash, blockBytes)` and `forgeRxor(...)` return `{ paddedMessage, appendedBlock, finalMessage, finalHash }` plus `paddingAdded` and a `verified` self-check.
- Both pad first, then compute and append the block, then **recompute the hash with the real `xorHash` or `rxorHash`** to confirm it equals the target.
- Edge cases covered by the tests:
  - A target of the wrong length throws, and the page shows a toast such as "block size too small for target hash".
  - An empty forged message gives an appended block equal to the target.
  - A forged message equal to the original appends a zero block (XOR).
  - The inputs are never modified, and the same input always gives the same output.
  - The tests run 50 random cases per block size for each algorithm and assert `hash(forged) === target`.

## Exercises

1. **Bank scenario.** Run the default scenario. Write down `X` in hex and check that it matches `371B`.
2. **Your own message.** Edit panel 2 to `Pay ₹99,999 to Eve`. Forge it and note that the hash still matches. How many bytes of padding did it need?
3. **Block-size experiment.** Try 8, 16, 32 and 128-bit blocks. Notice that the hash and the correcting block change length, but the forgery always works.
4. **XOR vs RXOR.** Forge the same message with both algorithms. Why do the correcting blocks differ?
5. **Contract scenario.** Use the contract-style scenario (a fake payment message). Change the amount and the payee, and forge it.
6. **SHA-256 contrast.** For every forgery, compare the two SHA-256 values. Count how many hex characters match (expect almost none).
7. **Real life.** A file server stores only `XOR(file)` as its checksum. Describe how an attacker uploads a modified file. (Answer: append one block of correction bytes at the end.)

---

# 6. Tab 3: Predictable-Data Analyzer

## Purpose

Prove the claim on slide 3: **real data is predictable, so a simple XOR hash does not use all of its bits.** A 128-bit XOR hash of English text has only **112 effective bits**, which changes the chance of an undetected change from 2^-128 to 2^-112.

## Theory

- In ASCII (and the ASCII part of UTF-8) the **highest-order bit of every byte is 0**.
- A 128-bit XOR hash is built from **16 byte positions**. Position j of the hash is the XOR of all message bytes whose index is j modulo 16.
- If every byte has bit 7 = 0, then bit 7 of every hash byte is the XOR of zeros, which is **0 always**.
- That fixes 1 bit per hash byte × 16 bytes = **16 bits**, leaving 128 − 16 = **112 effective bits**.
- With 16 fewer free bits, a random forged hash matches by luck with probability **2^-112 instead of 2^-128**, which is 65,536 times easier.

## Controls

| Control | Meaning |
|---|---|
| **Paste text to analyse** | A text box |
| **Choose File** | Upload a file (up to 5 MB). The file is read as bytes |
| **Load sample text** | Fills in an English sample |
| **Load random bytes** | Fills in data whose bytes cover all values (the contrast case) |
| **Clear** | Empties the analysis |
| **Hash size** | e.g. 128 bits (default). The effective bits are computed for this size |

A **Tip** reminds you to type an accented letter or an emoji: UTF-8 multi-byte characters set the highest bit, so the fixed bit disappears.

## Walkthrough

1. Click **Load sample text**, with **Hash size** at **128 bits**.
2. Look at the **bit heatmap**: eight columns, one for each bit position. The **leftmost column is bit 7**, and for English text it is **entirely zero** and highlighted.
3. Look at the **table of fixed bits**: bit 7 is reported as fixed at 0, and its frequency is 0.
4. Look at the **effective-bits result**: `128 − 16 × 1 = 112 effective bits`, and the probability `2^-112` compared with `2^-128`.
5. Click **Clear**, then **Load random bytes**. No bit is fixed, every column is about half ones, and the result is **128 of 128** bits.

## Reading the output and why

| Output | Meaning |
|---|---|
| **Bit frequency per position** | The fraction of bytes where that bit is 1. For ASCII: bit 7 is 0.0, others vary |
| **Fixed positions** | Positions whose frequency is (almost) 0 or (almost) 1 |
| **Effective bits** | `hashBits − (hashBits / 8) × fixedPerByte` |
| **Probability exponent** | −effective bits, compared with −hash bits |
| **Heatmap** | One row per byte and one column per bit, leftmost column = bit 7. Large inputs show only a limited number of rows |

Examples from the logic:

| Hash size | Fixed bits per byte | Effective bits |
|---|---|---|
| 128 | 1 | 112 |
| 128 | 2 | 96 |
| 64 | 1 | 56 |
| 128 | 0 | 128 |

A set of all 256 byte values gives a frequency of exactly 0.5 for every bit. An input of all `0xFF` bytes has all 8 positions fixed at 1. An empty input gives "not a number" frequencies, and the page reports nothing as fixed, never a fake result.

## Under the hood

- `bitAnalyzer.js`:
  - `bitPositionFrequency(bytes)` returns 8 numbers (bit 0 is the rightmost bit).
  - `fixedBitPositions(freq, threshold)` lists the positions that are (almost) always 0 or always 1.
  - `effectiveHashBits(hashBits, fixedPerByte)` does the 112-of-128 calculation. It requires `hashBits` to be a positive multiple of 8 and `fixedPerByte` to be an integer from 0 to 8.
  - `byteHeatmapData(bytes, maxRows)` returns the matrix for the grid.
  - `analyzeBytes(bytes, hashBits)` combines all of them.
- `analyzerView.js` handles the paste box, the file reader and the display. The calculation code never modifies the input.

## Exercises

1. **English vs random.** Load the sample, note 112; load random bytes, note 128.
2. **Predict then check.** Paste your own paragraph. Predict the effective bits, then confirm.
3. **Break the pattern.** Add one `é` or `₹` to a text of English. Does bit 7 stay fixed? (It should not: a single multi-byte character gives bit-7 ones.)
4. **Mixed text.** Paste half English and half non-English text (for example Kannada or Hindi). Predict what happens to the bit 7 column before you look.
5. **Pure non-ASCII.** Paste only non-ASCII text and note that bit 7 is now *always 1*, so it is still a fixed bit, just fixed at the other value.
6. **Hash-size effect.** Switch **Hash size** between 64, 128 and so on, for the same text. Note the effective bits are always `hash size × 7/8` for ASCII.
7. **Real life.** Upload a `.txt` file and then a compressed file or an image. Which has more fixed bits, and why? (Compressed data is close to random, so it has none.)

---

# 7. Tab 4: Collision and Avalanche Lab

## Purpose

Show three things in one place:

1. **Collisions** for XOR and RXOR are found instantly (slides 7 and 9).
2. A **short real hash** can still be broken by brute force: the birthday demo.
3. **Avalanche**: flip one input bit and count the output bits that change.

## Theory

**Collision.** Two different messages with the same hash. A secure n-bit hash should need about 2^(n/2) work to find one. XOR and RXOR need almost none.

**XOR collision by swapping.** XOR is commutative, so swapping two different blocks changes the message but not the hash. (Swapping two identical blocks changes nothing, which is why a message with all identical blocks, or with only one block, cannot be used.)

**RXOR collision.** Swapping fails because order matters. But the forgery construction still works: take another message, then append the one correcting block that makes it hash like the first.

**Birthday paradox.** With a truncated hash of n bits (2^n possible values), you expect the first collision after only about **1.2533 × 2^(n/2)** random tries, not 2^n. The 1.2533 is √(π/2). The pigeonhole principle guarantees a collision by 2^n + 1 tries.

| Truncated bits | Possible values | Expected tries (about) |
|---|---|---|
| 8 | 256 | 20 |
| 16 | 65,536 | 321 |
| 24 | 16.8 million | 5,100 |
| 32 | 4.3 billion | 82,000 |

Each extra 2 bits roughly doubles the work. For the full 256-bit SHA-256 you would need about **2^128 tries**, which is impossible.

**Avalanche effect.** A good hash flips about **half of its output bits** when one input bit changes. XOR and RXOR are linear, so one input bit flips **exactly one** output bit (RXOR just moves it).

## Section A: Collision race

### Controls

| Control | Meaning |
|---|---|
| **Message** | The first message (default `Pay Rs 100 to Ravi today`) |
| **Other message (RXOR only, optional)** | A second message to collide with. If left empty, the site flips the first bit of the message to make one |
| **Block size = XOR / RXOR hash size** | e.g. 16 bits (2 bytes) |
| **Find XOR collision** | Runs the block-swap collision |
| **Find RXOR collision** | Runs the correcting-block collision |

An explanation box says: *"XOR is commutative, so swapping two blocks keeps the hash. RXOR resists swapping, but one correcting block will still force any hash. SHA-256 has no shortcut: only brute force, and the work doubles for every 2 extra bits."*

### Walkthrough

1. Click **Find XOR collision**. You get two different messages with the **same hash** shown side by side. The second is the first with two different blocks swapped (same length, the same blocks in a different order).
2. Click **Find RXOR collision**. You get a second message that **starts with the other message** followed by padding and one correcting block, and its RXOR hash equals the original's.
3. Optionally type your own text into **Other message** and repeat.

### Reading the output and why

- **XOR collision is the same length** as the original (padded), because blocks were only rearranged. It costs no hash computations at all, just an arrangement.
- **RXOR collision is longer**, because the construction appends a correcting block. This proves the swap trick fails on RXOR but the forgery trick does not.
- **Errors:** with only one block, or with all identical blocks, the swap has nothing to swap and the page shows an error message.

## Section B: Race against truncated SHA-256

### Controls

| Control | Meaning |
|---|---|
| **SHA-256 truncated to** | 8, 16, 24 or 32 bits (default 16) |
| **Start race** | Runs the three methods side by side |
| **Run size sweep** | Runs the SHA-256 birthday search for several sizes and plots attempts against hash size |
| **Cancel** | Stops a running search |

Three cards appear: **XOR** ("swap two blocks"), **RXOR** ("append a correcting block"), and **SHA-256 (truncated)** ("brute force birthday search"). Each shows a status (**WAITING**, then running, then done), an **Attempts** counter and a **Time** in ms.

### Walkthrough

1. Choose **16 bits** and click **Start race**.
2. XOR and RXOR finish at once with a tiny attempt count and near-zero time.
3. The SHA-256 card counts upward until it finds two different messages with the same 16-bit prefix, usually a few hundred attempts.
4. Click **Run size sweep** and watch the chart: attempts climb steeply with hash size, following about 2^(n/2).

A blue note reads: *"Truncating SHA-256 is only a demo. The full 256-bit hash would need about 2^128 attempts."*

### Reading the output and why

- **The messages tried are `msg-0`, `msg-1`, `msg-2`, …**, hashed with SHA-256 and truncated to the chosen bits. The search stops when two of them share the same truncated hash.
- **The results are repeatable.** The tries are always in the same order, so running the same size twice gives the same attempt count. This is deliberate, so the demo does not surprise you.
- **Attempts are always between 2 and 2^bits + 1.** The first bound is because a collision needs two messages. The second is the pigeonhole limit.
- **It does not freeze the page.** The search runs in chunks and hands control back to the browser between them, so counters and the **Cancel** button keep working.
- **Cancel** uses an abort signal. A search that is already cancelled never reports a collision.

## Section C: Avalanche test

### Controls

The message appears as a **grid of clickable bits**, labelled with byte values at the end of each row.

| Control | Meaning |
|---|---|
| Click a bit | Flips that single input bit |
| **Flip random bit** | Flips a random input bit |
| **Run 100 trials** | Repeats over many random bit positions and shows the averages |

### Walkthrough

1. Click any bit in the grid, or press **Flip random bit**.
2. The result shows, for **XOR**, **RXOR** and **SHA-256**, how many output bits changed and what percentage, with the changed bits highlighted in each output grid.
3. Click **Run 100 trials** to get a chart of the average % of output bits flipped.

### Reading the output and why

| Algorithm | Bits changed | Why |
|---|---|---|
| **XOR** | exactly **1** (for a 16-bit hash that is 6.25%) | Each input bit feeds exactly one output bit |
| **RXOR** | exactly **1** (the bit has only **moved**) | Rotation relocates the changed bit by one place for every block after it, but never spreads it |
| **SHA-256** | about **50%** of its output bits | The 64 non-linear rounds mix every input bit into every output bit |

For RXOR, if the changed bit is in block j of m blocks, the changed output bit is shifted by (m − 1 − j) places, wrapping around. This is why the highlighted bit sits at a different place from the XOR one while the count stays at 1.

The chart compares the three algorithms on one axis: tiny bars for XOR and RXOR (about `1 / hash bits`) against a tall bar near 50% for SHA-256.

## Under the hood

- `collision.js`:
  - `xorBlockSwapCollision(msg, blockBytes)` pads the message, finds two *different* blocks, swaps them, and returns the new message (it throws if it cannot).
  - `rxorCollision(msg, blockBytes, otherBytes)` builds the other message, then uses the forgery construction to append the correcting block. It returns a message that starts with `otherBytes`.
  - `birthdayCollisionSha(bits, options)` is an async search that stores each truncated hash in a map and stops on the first repeat. It returns the attempts, the elapsed time, whether a collision was found, and the expected attempts.
  - `birthdaySweep(sizes)` runs it for each size and returns the results in the same order.
- `avalanche.js`: `avalancheTest(msgBytes, bitIndex)` flips the bit, recomputes XOR, RXOR and SHA-256, and counts the changed bits using the **Hamming distance**. `avalancheBatch(msg, trials)` repeats this and averages the result.
- `sha256.js`: `sha256(bytes)` wraps `crypto.subtle.digest`. `sha256Truncated(bytes, bits)` keeps only the first `bits` bits.
- `charts.js`: `renderAvalancheChart` (bar chart) and `renderCollisionChart` (attempts versus bits).

## Exercises

1. **Instant collision.** Use `PAY ALICE 100 RUPEES NOW` with 2-byte blocks. Find the XOR collision and read both messages aloud. Confirm both hashes are equal.
2. **Why swapping fails on RXOR.** Compare the XOR and RXOR collision results. Why is the RXOR one longer?
3. **Birthday table.** Run the race at 8, 16, 24 and 32 bits. Record the attempts and compare with 20, 321, 5,100 and 82,000.
4. **Repeatability.** Run the same size twice. Why are the numbers identical?
5. **Doubling rule.** From your table, how much more work does each extra 2 bits need?
6. **One bit, one bit.** Flip 10 different input bits and note XOR and RXOR change exactly 1 each time. Where does the RXOR bit land compared with the XOR bit?
7. **Averages.** Run 100 trials. Write down the XOR, RXOR and SHA-256 percentages.
8. **Real life.** A school stores a 16-bit checksum of each student record. How many records would you need before two are likely to share a checksum? (About 321.)

---

# 8. Tab 5: Learn

## Purpose

A **companion to the presentation**: short explainer cards so the app doubles as the notes for slides 1, 4 and 5. Nothing in it computes anything. It also links to every lab.

## What it contains

Quick-jump buttons at the top: **What is a hash? · Properties · Applications · XOR vs RXOR · Security limits · Worked example**.

1. **What is a hash function?** Defines `h = H(M)`, explains the fingerprint idea, padding to blocks, and appending the length. A button, **See the pipeline step by step**, opens the Visualizer.
2. **Properties of a good hash function.** Cards for variable input size, fixed output size, efficiency, preimage resistance, second-preimage resistance, collision resistance and pseudorandom output. The last four have buttons that open the Forgery, Collision and Avalanche tools that demonstrate each failure.
3. **Applications.** Message authentication, digital signatures, password storage, file integrity, intrusion and virus detection, and other uses (random numbers, key derivation, blockchains).
4. **XOR vs RXOR vs SHA-256.** A comparison table:

| Property | XOR | RXOR | SHA-256 |
|---|---|---|---|
| Formula | h = B1 ⊕ B2 ⊕ … ⊕ Bm | h = ROL1(h) ⊕ Bi, starting at h = 0 | 64-round compression of 512-bit blocks |
| Does block order matter? | No | Yes | Yes |
| Collision by swapping blocks | Always works | Fails | No known shortcut |
| Forgery by appending a block | Works: X = S ⊕ T | Works: X = ROL1(h') ⊕ T | Not possible |
| Flip one input bit | Exactly 1 output bit | Exactly 1 output bit | About 50% of output bits |
| Predictable ASCII text | Bit 7 of every byte is fixed: 16 of 128 bits fixed (112 effective) | The same pattern does not appear in the same way | No fixed bits |
| Linear in the input? | Yes | Yes | No |
| Verdict | Insecure | Insecure | Secure for practical use |

5. **Why XOR and RXOR are insecure.** Five cards, each with a button into the matching lab: forgery by appending a block, collisions by swapping blocks, no avalanche effect, predictable data wastes bits, and even a perfect hash has a birthday limit.
6. **Worked example: "HI" and "IH".** A table of the hashes:

| Hash | Binary | Hex |
|---|---|---|
| XOR("HI") | 00000001 | 01 |
| XOR("IH") | 00000001 | 01 |
| RXOR("HI") | 11011001 | D9 |
| RXOR("IH") | 11011010 | DA |

It explains that XOR gives the same hash for both orders, so swapping blocks is a free collision, while RXOR gives different hashes because order matters.

## Exercises

1. Read the properties cards, then click each lab link and write down which property each lab breaks.
2. Using only the comparison table, explain in two sentences why RXOR is "better" than XOR but still insecure.
3. Use the applications cards to name one real system that fails if its hash can be forged.

---

# 9. How it works internally

## 9.1 Architecture

The code is organised in strict layers. Data flows **core → attacks / analysis → ui**, and the lower layers never touch the page.

```
hash-forge/
├── index.html            page shell: top bar, #view container, footer, script tags
├── css/                  base (tokens, themes), layout, components, animations
├── js/
│   ├── main.js           entry point: starts the router, applies the theme, global state
│   ├── core/             the hash engine, NO DOM code
│   │   ├── config.js     constants: default block size 16, sizes 8/16/32/64/128, encoding, speed
│   │   ├── bitUtils.js   text↔bytes, binary/hex, xorBytes, rotateLeft1, countSetBits,
│   │   │                 hammingDistance, flipBit
│   │   ├── padding.js    zero padding, optional length block, splitIntoBlocks
│   │   ├── xorHash.js    xorHash, xorHashSteps
│   │   ├── rxorHash.js   rxorHash, rxorHashSteps
│   │   └── sha256.js     sha256 (Web Crypto), sha256Truncated
│   ├── attacks/          forgery.js, collision.js, avalanche.js
│   ├── analysis/         bitAnalyzer.js
│   ├── ui/               router.js, one view per tab, and components:
│   │                     bitGrid.js, hashCard.js, toast.js
│   └── charts/           charts.js (Chart.js wrappers)
├── assets/               logo and sample files (english.txt, random.bin.txt, contract.txt)
├── tests/                node --test unit tests
└── docs/                 demo script, architecture, viva Q&A, this guide
```

## 9.2 Data flow for one click

Example: clicking **Forge it**.

1. `forgeryView.js` reads the two messages, the algorithm and the block size from the page.
2. `textToBytes` (bitUtils) turns them into byte arrays (UTF-8).
3. `xorHash` or `rxorHash` (core) hashes the original to get the target `T`.
4. `forgeXor` or `forgeRxor` (attacks) pads the forged message, computes the correcting block, appends it, and re-hashes to verify.
5. `sha256` (core) hashes both final messages for the comparison, asynchronously.
6. The view renders the result with `hashCard.js` (hex and binary, copy button, match or mismatch state) and `bitGrid.js`, and `toast.js` shows any error.

## 9.3 Design rules that keep it trustworthy

- **No fake results.** Every claim is recomputed with the real hash functions, never taken on trust. For example, the forgery's final hash is recomputed, not assumed.
- **Pure functions.** No function modifies its input arrays. Tests check this.
- **Deterministic.** The same input always gives the same output, including the birthday search.
- **Async only where needed.** Only SHA-256 and the birthday search are asynchronous (the browser's crypto API is async). The XOR and RXOR code is plain and synchronous.
- **Chunked search.** The brute-force loop yields to the browser regularly so the interface stays responsive and **Cancel** works.

## 9.4 The unit tests

Run with `npm test`. They cover:

| File | What it proves |
|---|---|
| `xorHash.test.js` | Known vectors including the slide example, order independence, linearity, one-bit avalanche, `M‖M = 0` |
| `rxorHash.test.js` | Known vectors (`HI` = D9, `IH` = DA, `ABC` = C2), order matters, linear, one bit moves but never spreads |
| `forgery.test.js` | For many random messages and targets, `hash(forged) === target` for XOR and RXOR, edge cases, no mutation |
| `collision.test.js` | Swapped messages differ but keep the XOR hash, RXOR collision construction, birthday bounds, abort handling, sweep order |
| `bitAnalyzer.test.js` | ASCII has bit 7 at 0, 256 byte values give 0.5 everywhere, 112 effective bits, invalid arguments rejected |

A passing run is the evidence that the demo is mathematically correct and that the on-screen numbers are not hard-coded.

---

# 10. Master exercise set

Do these in order for a full tour. Each one names the tab it uses.

1. **(Visualizer)** Reproduce `01001000 ⊕ 01001001 = 00000001`.
2. **(Visualizer)** Show that `HI` and `IH` collide under XOR but not under RXOR.
3. **(Visualizer)** Predict the XOR hash of `ABC` for 1-byte and 2-byte blocks (`40` and `0242`), then check.
4. **(Forgery)** Forge `Pay ₹100 to Ravi` into `Pay ₹10,000 to Ravi` with XOR. Verify the correcting block is `371B` and the final hash is `299e`.
5. **(Forgery)** Repeat with RXOR and explain why the block differs.
6. **(Forgery)** Show the SHA-256 contrast for both messages.
7. **(Analyzer)** Show 112 of 128 for English and 128 of 128 for random bytes.
8. **(Analyzer)** Add one non-ASCII character to English text and watch the fixed bit disappear.
9. **(Collision)** Find an XOR collision and an RXOR collision for your own sentence.
10. **(Collision)** Run the birthday race at 8, 16, 24 and 32 bits and compare to 20, 321, 5,100 and 82,000.
11. **(Collision)** Flip one bit and compare the XOR, RXOR and SHA-256 avalanche.
12. **(Learn)** Use the comparison table to defend the statement "RXOR is still insecure."

### Capstone: the invoice attack

Imagine a shop emails invoices as plain text and protects each with an XOR hash sent separately.

1. Type an invoice such as `Invoice 17 total Rs 2,500` in the **Forgery** original box.
2. As the attacker, change the total to `Rs 25` and forge it.
3. Show the hashes match, so the receiver's check passes.
4. Show the same two invoices hash completely differently under SHA-256.
5. In two sentences, explain what the shop should change. (Use a secure hash such as SHA-256, preferably with a key or a signature, so the attacker cannot recompute it.)

---

# 11. Honest limitations

The site states these on purpose, and you should state them too:

- **The correcting block is arbitrary bytes.** It shows as hex because it is usually unreadable as text. A real attacker would hide it, for example in a comment field or in unused data.
- **This models an attack on a protected hash, not on a keyed system.** The forgery assumes the hash is protected and the message is not, as in the lab's setting. A keyed construction (such as a MAC) is different.
- **The hash sizes are small** (8 to 128 bits) so the demos run instantly and fit on a screen.
- **The birthday demo uses a truncated hash** so a brute-force search finishes in seconds. It does not weaken SHA-256 itself.
- **Zero padding is ambiguous** without the length option. `HI` and `HI` plus a zero byte can look the same.
- **UTF-8 changes sizes.** Non-ASCII characters take several bytes, which changes block counts and the Analyzer's result.
- **SHA-256 truncated to 8 to 32 bits is not a real-world hash.** It is a teaching tool.
- **The tool is for education.** Do not use XOR or RXOR hashing for anything real.

---

# 12. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Blank page, or console error about modules or CORS | You opened `index.html` directly (`file://`). Serve it with `npx serve` or Live Server |
| SHA-256 does nothing or shows an error | The page is on an insecure address. Use `localhost` or an `https://` link |
| Charts do not draw | Chart.js did not load from the CDN. Check your internet connection |
| Byte count is larger than the character count | Non-ASCII characters (like `₹`) use 2 to 4 bytes each in UTF-8 |
| Forgery or collision shows an error toast | The hash size is too small for the target, or the message has only one block or all identical blocks |
| Birthday search seems slow at 32 bits | It needs about 82,000 SHA-256 calls. Press **Cancel**, or use a smaller size |
| Numbers differ from this guide | Check the block size and whether the "Append the length" option is on |
| Tests fail | Run `npm test` and read the first failing test. A `ReferenceError` points at the test file, not the hash code |
| Push to GitHub fails with "src refspec main does not match any" | There is no commit yet: run `git add .`, `git commit -m "..."`, then `git push -u origin main` |

---

# 13. Glossary

| Term | Meaning |
|---|---|
| **Hash / digest** | Fixed-size fingerprint of a message |
| **Block** | A fixed-size chunk of the message (n bits) |
| **Padding** | Extra zero bytes added to fill the last block |
| **XOR (⊕)** | Bitwise "exclusive or": 1 if the bits differ |
| **ROL1** | Circular rotation left by one bit across the whole block |
| **RXOR** | Rotate-then-XOR hash |
| **Collision** | Two different messages with the same hash |
| **Preimage** | A message that produces a given hash |
| **Second preimage** | A different message with the same hash as a known message |
| **Forgery** | Producing a modified message that passes the hash check |
| **Correcting block** | The extra block appended to force a chosen hash |
| **Avalanche effect** | One input bit change flipping about half the output bits |
| **Hamming distance** | The number of bit positions where two values differ |
| **Linear hash** | `H(A) ⊕ H(B) = H(A ⊕ B)`; makes forgery easy |
| **Effective bits** | Hash bits that can actually vary for a given type of data |
| **Birthday attack** | Finding a collision in about 2^(n/2) tries |
| **Pigeonhole principle** | With more messages than hash values, a collision is certain |
| **Truncated hash** | Only the first n bits of a longer hash |
| **UTF-8** | Text encoding: ASCII is 1 byte, other characters 2 to 4 bytes |
| **Web Crypto API** | The browser's built-in cryptography (`crypto.subtle`) |

---

# 14. Viva cheat sheet

**Q: What does the project do?**
It shows, live in a browser, that XOR and RXOR hashes can be forged and collided, and that SHA-256 resists the same attacks.

**Q: Why does appending a block work?**
Both hashes are linear. The final hash is a simple XOR expression of the blocks, so one extra block can be solved for: `X = S ⊕ T` for XOR, `X = ROL1(h') ⊕ T` for RXOR.

**Q: Why is RXOR still insecure?**
Rotation fixes block-swap collisions but not the correcting-block attack. It is still linear, and flipping an input bit moves one output bit instead of scrambling many.

**Q: Why 112 and not 128?**
ASCII bytes have bit 7 equal to 0. A 128-bit hash has 16 byte positions, so 16 hash bits are always 0, leaving 112. The chance of an undetected change rises from 2^-128 to 2^-112.

**Q: Why is SHA-256 different?**
It is non-linear and mixes every input bit through 64 rounds, so there is no equation to solve and no swapping trick, and about half the output flips for a single input bit.

**Q: What is the birthday attack?**
With n output bits, a collision is expected after about 1.2533 × 2^(n/2) tries. The demo shows it on a truncated SHA-256. The full hash would need about 2^128.

**Q: What is the limitation of the demo?**
The appended block is arbitrary bytes, so it looks like garbage. We show it in hex and note that a real attack could hide it.

**Q: How do you know your results are right?**
Every result is recomputed with the real hash functions, and 117 automated tests check known vectors, random cases and edge cases.

---

*End of guide.*