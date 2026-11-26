# Experimentation Patterns & Statistical Rules

Core principles for designing and interpreting Flagsmith experiments.

---

## 1. Metric Architecture

Every experiment should define:
1. **Primary Metric (1 only):** The North Star that drives the decision (e.g. `readout_score`, `checkout_conversion`).
   - Sized for statistical power.
   - Has a defined direction (`increase` or `decrease`).
2. **Guardrail Metrics (1–3):** Safety checks that must NOT degrade (e.g. `latency`, `completion_rate`, `error_rate`).
   - If a guardrail degrades with statistical significance, the test is aborted or rejected even if the primary metric gained.
3. **Exploratory Metrics:** Behavioral observations not bound by decision rules.

---

## 2. Decision Rules & Stopping Criteria

Avoid the **peeking fallacy** (calling tests too early when an early spike appears):
- **Minimum Sample Size:** Never declare a result before reaching the pre-registered sample size (e.g., minimum 100 participants per arm for pilots, 1,000+ for production features).
- **Sample Ratio Mismatch (SRM):** Always run a Pearson Chi-Square test on exposure counts before reading lifts:
  $$\chi^2 = \sum \frac{(O_i - E_i)^2}{E_i}$$
  If $p < 0.001$, traffic is biased; abort analysis.
- **Bayesian Win Probability:**
  - $> 95\%$: Statistically decisive winner.
  - $5\% - 95\%$: Inconclusive. Maintain control.
  - $< 5\%$: Statistically decisive loser. Maintain control.
