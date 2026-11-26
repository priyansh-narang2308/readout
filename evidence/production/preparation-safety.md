# Can a prepared (CREATED) Production experiment affect players before launch?

Read from Flagsmith's source at tag **v2.291.0** (`api/experimentation/serializers.py`, `services.py`, `views.py`,
`feature_state_metadata.py`; `api/features/future/services.py`) and from the frozen app (`src/flagsmith/client.ts`,
`src/content/study.ts`). 17 Nov 2026. Nothing was created in Production to establish this.

## What creating the experiment actually does

`POST /environments/{key}/experiments/` (`ExperimentSerializer.create`) **requires** `experiment_rollout` and, in one
transaction, attaches the metrics in the order given and calls `apply_experiment_rollout`. On the first rollout that:

1. creates the experiment's rollout segment (a system segment: percentage split at `rollout_percentage`);
2. `_reset_default_allocations_to_control`: sets every variant's weight to 0 on the **environment default**. In
   Production `chance_to_win` is already 0 (preflight.md), so nothing changes;
3. `_write_rollout_override`: writes a **live segment override** on `readout_framing` for that segment, with
   `enabled` **exactly as sent**, the value, and the 50/50 variant weights;
4. rebuilds the environment document.

The status stays `created`. So creating the experiment is **not** inert: the override is served from the moment it is
written, to every identity in the segment (100% rollout = every identified Production user).

`POST …/start/` moves the status to `running` and calls `enable_experiment_rollout`, which only flips that override's
`enabled` to true (the stored 50/50 weights are kept: `update_flag` with `replace=False` writes variants only when
given).

## What a player's browser sees

| | `experiment_rollout.enabled: true` at creation (**what `experiment.template.json` says**) | `enabled: false` at creation (**what the Production script sends**) |
|---|---|---|
| Flag served to an identity | enabled; value `chance_to_win` for ~50% of identities, `p_value` for the rest | **disabled** |
| Experiment metadata (`flag.experiment`) | **none**: `get_feature_state_metadata_builder` only reads experiments with status `running` | **none** |
| App gate (`evaluateGate`) | `not-in-experiment`, with `rollout` = the served value | `flag-disabled` |
| What the player gets | practice, opening on **`chance_to_win` for half of them**: the treatment leaks into the default experience | practice, opening on **`p_value`**: the same as today |
| Copy shown | "not running" | "not running" (`PRACTICE_COPY['flag-disabled']` and `['not-in-experiment']` are the same `NOT_RUNNING` text) |
| `$flag_exposure` / score events | none: the app only records exposure inside an enrolled measured run, and enrolment needs `flag.experiment.inExperiment === true` | none, same reason |

Today (no experiment): flag enabled, value `p_value`, no metadata → `not-in-experiment` with rollout `p_value` →
practice on `p_value`, "not running". **With `enabled: false` the player-visible result is identical.** The landing page
makes no Flagsmith request at all before Start (V-4), so only someone who presses Start is evaluated, and they are never
measured.

## Conclusion

- Preparing the experiment with **`enabled: false`** cannot expose the treatment, cannot change the default experience,
  and cannot generate exposures or metric events before launch. It is safe.
- Preparing it with `enabled: true`, as `flagsmith/experiment.template.json` reads, would serve `chance_to_win` as the
  practice default to about half of anyone who presses Start before launch. **Unsafe; never used for Production.** The
  template is the design (100%, 50/50, value, metrics); `enabled` is a launch-time state, which the Start endpoint
  sets. The Production script refuses any body with `enabled: true`.
- Start sets `enabled: true` and the status `running` together; only from then on is anyone enrolled or exposed.

Safe alternative, if the owner prefers nothing in Production before launch day: create and start in one sitting on
26 Nov after 08:00 IST (the same script with `--apply-production-prep`, then Start), at the cost of less time to review
the prepared experiment.

## Residual effects of preparing (accepted, disclosed)

- An identity that presses Start before launch is created in Production (as today) and evaluated against a disabled
  flag. Nobody plays Production before launch (SETUP.md §4, G-6), so this should not happen.
- The prepared experiment's rollout override and system segment exist in Production from preparation onwards.
