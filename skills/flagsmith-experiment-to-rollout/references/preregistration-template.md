# Experiment: <name>

Written <date>, before any data. Do not edit sections 1–7 after the start; add amendments below with a date.

1. **Change**: <what differs between control and treatment, in one sentence>
2. **Hypothesis**: <treatment> <increases/decreases> <primary metric> compared with <control>.
3. **Flag**: `<feature>`; control `<c>` (default), treatment `<t>`; split 50/50 via the experiment rollout.
4. **Primary metric** (one): <event / aggregation>, expected direction <increase|decrease>.
5. **Guardrails**: <metric> must not <decrease/increase> (stop and roll back if it breaks).
6. **Sample and window**: at least <N> exposures in total; runs from <start> to <end>. No decision before <end>.
7. **Decision rule**:
   - Sample-ratio check fails (p < 0.001) → broken, no result is read.
   - Guardrail broken → roll back to control.
   - Primary metric: winner when Flagsmith reports ≥ <95>% chance to be best for one arm; otherwise no difference
     → keep control.

## Result (filled at the end)

As of <time>: exposures <A> / <B>, SRM p = <p>, primary <value>, decision <winner|no difference|broken>.
