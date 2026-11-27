# Decision rules (steps 6 and 7)

Apply in this order. The first rule that fires decides; later rules are not read.

1. **Sample ratio first.** `node scripts/srm.mjs --a <n> --b <n>` on the two exposure counts.
   - exit 1 (p < 0.001): the split is broken. Report it, stop the experiment (approval), interpret nothing.
   - exit 3 (< 100 exposures): not assessed; keep running until the window ends.
2. **Guardrails.** A guardrail moving the wrong way beyond its pre-registered limit → rollback (`rollback.md`).
3. **Window.** Before the pre-registered end time, nothing is decided. No peeking, no early winner.
4. **Primary metric** at the end: apply the pre-registered threshold exactly as written.
   - met for one arm → that arm wins → step 8.
   - not met → no difference → keep control (the change did not prove itself).
5. **Report** in one line with the as-of time: `exposures A/B · SRM p · primary · decision`. Exploratory metrics
   may be mentioned only as exploratory.
