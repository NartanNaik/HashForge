<!--
  File    : docs/viva-qna.md
  Project : Hash Forge

  WHAT THIS FILE DOES
  Likely viva questions from the guide, with short answers that match what
  the code in this project actually does. Read the "trap" notes at the end
  before the viva.
-->

# Hash Forge: Viva Q&A

## A. Hash basics

**Q1. What is a hash function?**
A function that maps a message of any length to a fixed-size value (the hash
or digest). The same message always gives the same hash.

**Q2. What properties should a good hash have?**
Variable-length input, fixed-length output, efficient to compute, preimage
resistance (cannot find a message from its hash), second-preimage resistance
(cannot find another message with the same hash as a given one), collision
resistance (cannot find any two messages with the same hash), and
pseudorandom-looking output.

**Q3. Why padding and blocks?**
The hash works on fixed-size blocks, but messages have any length. We
zero-pad the message to a multiple of the block size (Slide 2). Optionally the
original length in bits is appended as a length field, which makes it harder
to build an alternative message with the same hash.

**Q4. What do we use the hash for?**
Message authentication, digital signatures, password storage, file integrity,
intrusion and virus detection.

## B. XOR and RXOR

**Q5. How does the XOR hash work?**
Split the padded message into n-bit blocks. The hash is the bitwise XOR of all
blocks: `h = B1 ^ B2 ^ ... ^ Bm`. Example: `01001000 ^ 01001001 = 00000001`
for the message "HI" with 8-bit blocks.

**Q6. How does RXOR work?**
Start with `h = 0`. For each block: rotate `h` left by one bit (circular, over
the whole n-bit value), then XOR the block: `h = ROL1(h) ^ Bi`. For "HI" with
8-bit blocks: `0x48`, then `ROL1(0x48) = 0x90`, `0x90 ^ 0x49 = 0xD9`.

**Q7. Why does RXOR exist? What did rotation fix?**
Plain XOR ignores the order of blocks. Rotation makes the order matter, so
swapping two blocks gives a different hash.

## C. The forgery attack (Slide 10)

**Q8. Why does appending a block work for XOR?**
Let S be the XOR of all blocks of the forged message and T the target hash.
Append `X = S ^ T`. The new hash is `S ^ X = S ^ S ^ T = T`, because `S ^ S = 0`.

**Q9. Why does it also work for RXOR?**
Process the forged message to get `h'`. Append `X = ROL1(h') ^ T`. The next
step computes `ROL1(h') ^ X = ROL1(h') ^ ROL1(h') ^ T = T`. We control the
last block, and XOR is reversible, so we can force any final value.

**Q10. So why is RXOR not secure?**
Rotation only stops the "swap blocks" trick. The hash is still linear (XOR and
rotation are linear operations) and the last block fully controls the result.
Flipping one input bit changes exactly one output bit.

**Q11. Where did the attack assumption come from?**
Slide 10: the message is sent in plaintext and only the hash code is
protected. The attacker needs a different message with the same hash, so the
receiver recomputes the hash, sees a match and never notices.

**Q12. Does the length field stop the forgery?**
No. The attacker can include the length block in the calculation. The forged
message would have a different length, so the length block changes, but the
attacker simply computes the correcting block after it. Our code uses plain
zero padding by default so the maths stays exactly equal to the hash function.

**Q13. What is the limitation of your demo?**
The appended block is essentially arbitrary bytes, so it looks like unreadable
characters. We show it in hex. In a real attack it could be hidden, for
example in a comment field or trailing data.

**Q14. How do you know the forgery is really correct?**
Three checks: `forgery.js` recomputes the hash with the real `xorHash` or
`rxorHash` and throws if it differs; `forgeryView.js` recomputes it again
independently; and `forgery.test.js` checks `hash(forged) === target` for 50
random cases per block size, for both algorithms.

## D. Collisions

**Q15. Why is XOR collision-finding instant?**
XOR is commutative. Swapping two different blocks gives a different message
with the same hash (`a ^ b = b ^ a`).

**Q16. And for RXOR?**
Swapping does not work because order matters. But the forgery construction
gives a collision instantly: take any other message and append the correcting
block that makes its hash equal to the hash of the original.

**Q17. What is the birthday paradox?**
To find two inputs with the same n-bit hash we need only about `2^(n/2)`
random tries, not `2^n`, because we compare every new hash with all earlier
ones. The expected count is about `1.2533 * 2^(n/2)`.

**Q18. What numbers does your demo show?**
Truncated SHA-256: 8 bits about 20 attempts, 16 bits about 321, 24 bits about
5,100, 32 bits about 82,000. Full SHA-256 would need about `2^128`: impossible.

**Q19. Why truncated SHA-256?**
Full SHA-256 collisions are infeasible, so to show the birthday growth we cut
the output to a small size.

## E. Avalanche

**Q20. What is the avalanche effect?**
Changing one input bit should change about half of the output bits.

**Q21. What does your lab show?**
XOR: exactly 1 bit changes. RXOR: exactly 1 bit changes (the rotation only
moves it to another position). SHA-256: about 50% of 256 bits, roughly 128.

**Q22. Why is a low avalanche a problem?**
Small input changes cause small, predictable output changes. That is what makes
forging and collision-finding easy: an attacker can compute exactly how to
cancel a change.

## F. Predictable data (112 of 128)

**Q23. Why 112 and not 128?**
ASCII characters use only 7 bits, so bit 7 (the highest-order bit) of every
byte is 0. With a 128-bit hash made of 16 bytes, XOR of zeros stays zero, so
those 16 bits are always 0 in the hash. Effective bits = 128 - 16 = **112**,
so the probability of a match is `2^-112` instead of `2^-128` (Slide 3).

**Q24. Does it apply to RXOR too?**
The 112-of-128 result is stated for the plain XOR hash. For RXOR, the rotation
moves the always-zero bits around, so the same fixed-bit pattern does not
appear in the hash. We say this on the Learn page.

**Q25. Does it hold for any text?**
Only for ASCII text. Non-ASCII UTF-8 text (like the rupee sign) has bytes with
bit 7 equal to 1, so the pattern breaks. Our tests check that too.

## G. Design and implementation

**Q26. Why no backend?**
Everything is hash maths that runs in the browser. Free hosting (GitHub Pages
or Netlify) and the demo is only a link.

**Q27. Why not write SHA-256 yourself?**
We use the browser's Web Crypto API (`crypto.subtle.digest`). It is correct
and fast. The point of the project is to show the weak hashes failing, not to
reimplement a strong one.

**Q28. Why does SHA-256 need https?**
`crypto.subtle` exists only in a secure context: https or `http://localhost`.

**Q29. How is the code organised?**
Three layers: `core` (hash engine) -> `attacks` and `analysis` -> `ui`.
Only `ui` touches the DOM, so all logic is testable with `node --test`.

**Q30. How did you test it?**
Unit tests for XOR, RXOR, forgery, collisions and the bit analyzer, using
hand-calculated vectors (the Slide 3 example, "HI" = `0xD9` for RXOR) plus
random repeatable inputs.

**Q31. How would you fix the weakness?**
Use a cryptographic hash (SHA-256 or SHA-3). To protect against someone
changing the message AND the hash, use a keyed construction (HMAC) or a
digital signature, so the attacker cannot compute a valid tag without a secret
key.

## Traps to avoid

- Do not say "XOR hash is the same as checksum security". It is only a
  checksum for accidental errors, not for attackers.
- Do not claim SHA-256 collisions are impossible. They are **infeasible**
  (about `2^128` work), not mathematically impossible.
- Do not say RXOR avalanche is "better". It still changes exactly 1 bit.
- Do not claim `random.bin.txt` is cryptographically random. It is only a
  contrast sample whose high bits vary.