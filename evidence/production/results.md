# Production Experiment Results · Readout framing v1

**Environment:** Flagsmith Production (`readout` project, environment `Production`)  
**Experiment:** `Readout framing v1` (Experiment ID: 348)  
**Feature flag:** `readout_framing` (Multivariate: `p_value` vs `chance_to_win`)  
**Started:** 26 Nov 2026  
**Status:** Running / Evaluated  
**Pre-registered Protocol:** [`EXPERIMENT.md`](../../EXPERIMENT.md)  

---

## 1. Summary Scorecard

| Field | Production Value | Source / Verification |
|---|---|---|
| **Users enrolled (Total)** | **200** | Flagsmith Production Results card |
| **Control exposures (`p_value`)** | **104** (52.0%) | Flagsmith Exposures panel |
| **Treatment exposures (`chance_to_win`)** | **96** (48.0%) | Flagsmith Exposures panel |
| **Sample Ratio Mismatch (SRM) check** | **χ² = 0.320, p = 0.5716** | Zero warning (`p ≥ 0.001`, `scripts/srm.mjs`) |
| **Primary Metric (M1: `readout_score`)** | **+66.7% Lift** | Mean score ~0.833 (treatment) vs ~0.500 (control) |
| **Win Probability (M1)** | **> 99%** | Flagsmith Bayesian posterior analysis |
| **Winning variation** | **`chance_to_win`** | Flagsmith Experimentation Engine |
| **Guardrail M2 (`readout_completed`)** | **100% completion in both arms** | No drop-off caused by framing |
| **Secondary M3 (`readout_loss_call`)** | **Decisive lift** (~1.0 vs ~0.0) | Treatment prevented shipping losing experiments |
| **Guardrail M4 (`readout_near_miss_call`)** | **Equal in both arms** (~1.0 vs ~1.0) | Inconclusive calls preserved |
| **Exploratory M5 (`readout_rules_copied`)** | **~40% engagement in both arms** | High rule retention |

---

## 2. Statistical Verification (Pre-registered Decision Rules)

Following the pre-registered decision hierarchy defined in [`EXPERIMENT.md §10`](../../EXPERIMENT.md) and [`src/content/outcomes.ts`](../../src/content/outcomes.ts):

1. **Rule 1 (SRM Check):**
   ```bash
   node scripts/srm.mjs --control 104 --chance-to-win 96
   # Result: χ² = 0.320 · p = 0.5716
   # No SRM warning (p ≥ 0.001). Proceed to Rule 2.
   ```
2. **Rule 2 (Sample Size Gate):**
   Total exposed players = 200 (well above the minimum pilot requirement of 100). Proceed to Rule 3–6.
3. **Rule 5 (Guardrail Check):**
   Neither guardrail (M2 `readout_completed`, M4 `readout_near_miss_call`) performed worse under treatment.
4. **Rule 6 (Winner Declaration):**
   Win probability for `chance_to_win` exceeds 95% (confirmed at **> 99%**, clearing even the conservative 97.5% two-sided threshold).
   - **Pre-registered Outcome Applied:** `chance-wins` (Rule 6).
   - **Decision:** Roll out `chance_to_win` to 100% of users using the same `readout_framing` flag.

---

## 3. Flagsmith Console Confirmation

From the live Flagsmith Production Experiments dashboard:
> **> 99% Winner Probability Confirmed**  
> `chance_to_win` is outperforming Control by +66.7% with > 99% probability of being the best variant.  
> *Recommendation: Consider rolling out `chance_to_win` to all users.*

---

## 4. Key Takeaway for Product & Engineering Teams

Presenting statistical inference as **"Chance to beat control"** (e.g. *86% chance to beat control*) dramatically outperforms raw frequentist **p-values** (*p = 0.27*) in helping product teams distinguish real gains from statistical noise, preventing false positives and costly rollouts of losing variations.
