<!--
  File    : docs/demo-script.md
  Project : Hash Forge

  WHAT THIS FILE DOES
  A minute-by-minute plan for the live demo: who speaks, what to click, what
  to say, and the "wow moment" sequence. Replace "Presenter A / B / C" with
  your real team names.
-->

# Hash Forge: Demo Script (about 10 minutes)

**Pitch to open with:** "We don't just tell you XOR and RXOR hashes are
insecure. We break them live, and show a real hash, SHA-256, resisting the
same attacks."

## Before you start (5 minutes earlier)

- Open the **hosted https link** (or `http://localhost`). Do NOT open
  `index.html` from a file, and do not use a plain `http://192.168.x.x`
  address: SHA-256 needs a secure context.
- Check there is **no warning toast** at the bottom right. If there is one,
  fix it first (it means Chart.js did not load or SHA-256 is unavailable).
- Set the browser zoom so text is readable from the back (the layout scales
  up on large screens automatically). Choose the theme that suits the room.
- Open the tab once for each module, so they are already loaded.
- Have the keyboard shortcut ready: Tab navigation works everywhere.

## Timeline

| Time | Who | Page | What to do and say |
|---|---|---|---|
| 0:00 to 1:00 | Presenter A | Learn | Say the pitch. Click "XOR vs RXOR vs SHA-256" in the jump buttons. "This table is the whole talk. Now we prove each row." |
| 1:00 to 2:30 | Presenter A | Visualizer | Message `HI`, block size **8 bits**, algorithm **XOR**. Press **Play**. Point at the last step: `01001000 ^ 01001001 = 00000001` (the Slide 3 example). Then switch to **Both**: XOR gives `00000001`, RXOR gives `11011001`. "Same blocks, rotation changes the result." |
| 2:30 to 3:30 | Presenter A | Visualizer | Type `IH`. XOR hash is still `00000001`, RXOR changes. "XOR does not care about order. That is its first weakness." |
| 3:30 to 6:00 | Presenter B | Forgery | **Wow moment 1.** Scenario "Pay Rs 100 to Bob" -> "Pay Rs 10000 to Eve", algorithm XOR, block size 2 bytes. Show panel 1 (original and its hash), panel 2 (the attacker's message). Press **Forge it**. The green **HASHES MATCH** banner appears. Point at the appended block in hex: "One extra block, computed as S xor T." |
| 6:00 to 6:45 | Presenter B | Forgery | Switch to **RXOR**, press Forge it again. Match again. "Rotation stops block swapping, but not appending a correcting block." State the limitation honestly: "The appended block looks like unreadable characters, so we show it in hex. In a real attack it could hide in a comment field." |
| 6:45 to 7:30 | Presenter B | Forgery | Scroll to the SHA-256 comparison. "Same two messages under SHA-256: completely different, about half of the 256 bits differ." This is the **wow moment 2**. |
| 7:30 to 8:30 | Presenter C | Analyzer | Load `english.txt`. Bit 7 column glows as all zero, effective bits **112 of 128** (2^-112 instead of 2^-128). Then click **load random data** (or `random.bin.txt`): no fixed bit. |
| 8:30 to 10:00 | Presenter C | Collision | **Wow moment 3.** Avalanche: click one input bit. XOR changes **1** bit, RXOR changes **1** bit (it only moved), SHA-256 changes about **128 of 256**. Press **Run N trials** to show the bar chart. Then the collision race: XOR and RXOR collisions are instant, truncated SHA-256 needs about 20, 321, 5,100 and 82,000 attempts for 8, 16, 24 and 32 bits. "At 256 bits it would be about 2^128. Impossible." |
| 10:00 | Presenter A | Learn | One-line conclusion: "XOR and RXOR are linear. Linear means forgeable. SHA-256 is not." |

## The "wow moment" sequence

1. **Banner turns green** after Forge it (the audience sees a forged message
   accepted).
2. **SHA-256 turns it red** (same attack, completely different hash).
3. **Avalanche bars**: 1 bit vs about 50%.

Keep these three in this order if you are short on time (about 4 minutes).

## Short version (4 minutes)

Forgery (XOR, then RXOR, then the SHA-256 comparison) -> Collision page
avalanche chart -> Analyzer 112 of 128.

## If something goes wrong

| Problem | Fix |
|---|---|
| Warning toast about SHA-256 | You are not on https or localhost. Switch to the hosted link. |
| Charts are empty | Chart.js did not load (internet). Reload the page, or explain the numbers from the avalanche cards. |
| Chart colours wrong after changing theme | Press Run N trials (or the sweep) again to redraw it. |
| "Need at least two different blocks to swap." | The message has one block or all identical blocks. Type a longer message. |
| "Target hash must be ..." | The block size does not match the hash size. Reset the block size. |
| Birthday search is slow at 32 bits | Press **Cancel**, use 16 or 24 bits. |
| A tab fails to load | Reload. A broken view only affects its own page, the others keep working. |

## Roles during questions

- Presenter A: hash basics, padding, slides.
- Presenter B: forgery maths and the limitation.
- Presenter C: analyzer, collisions, birthday bound, avalanche.