# End-to-End Development Run: `skill_demo_button_text`

**Environment:** Flagsmith Development (environment: `<dev-client-key>`, project: `readout`)  
**Flag:** `skill_demo_button_text`  
**Purpose:** End-to-end dry-run and validation of the `flagsmith-experiment-to-rollout` workflow.  
**Execution:** All keys, IDs, and tokens masked. Development only. Zero production impact.

---

## Step 1: Pre-register

Pre-registration saved to `experiments/demo-button-text.md`:
- **Hypothesis:** Changing button text from "Submit" to "Get Started" increases click-through rate without increasing form bounce rate.
- **Flag:** `skill_demo_button_text`
- **Control:** `"submit"` (default, weight 100% in environment)
- **Treatment:** `"get_started"` (weight 0% in environment default; 50% in experiment rollout)
- **Primary metric:** `button_clicked` (direction: `increase`, aggregation: `mean`)
- **Guardrail:** `form_bounced` (direction: `not_decrease`, aggregation: `occurrence`)
- **Planned sample:** 200 exposures per arm (minimum 100 for SRM check)

---

## Step 2: Wire Code

```bash
# Locate feature callsite in code
grep -rn "button_text" src/
# -> src/components/Form.tsx:24: const text = flagsmith.hasFeature("skill_demo_button_text") ? ...

# Open draft PR with GitHub CLI
gh pr create --draft --title "feat: wire skill_demo_button_text flag check" \
  --body "Gates the new button text behind skill_demo_button_text (default: control)."
```
```text
step 2 ✓ PR #45 wires flag skill_demo_button_text (default: control)
```

---

## Step 3: Set up in Development

```bash
# 3.1 Create feature with control and treatment variants
cat <<'EOF' > variants.json
[
  { "value": "submit", "weight": 100 },
  { "value": "get_started", "weight": 0 }
]
EOF

flagsmith feature create skill_demo_button_text \
  --description "Experiment: Button Text" \
  --value "submit" \
  --enabled \
  --variants @variants.json

flagsmith feature get skill_demo_button_text \
  --jq '{name: .name, type: .type, variants: [.multivariate_options[].string_value]}'
```
```json
{
  "name": "skill_demo_button_text",
  "type": "MULTIVARIATE",
  "variants": ["submit", "get_started"]
}
```

```bash
# 3.2 Create primary metric via Flagsmith API
cat <<'EOF' > metric.json
{
  "name": "button_clicked",
  "aggregation": "mean",
  "direction": "up",
  "definition": { "event": "button_clicked", "version": 1 }
}
EOF

flagsmith api api/v1/environments/<dev-env-key>/experiment-metrics/ \
  --input metric.json --jq '{id, name}'
```
```json
{
  "id": "M1",
  "name": "button_clicked"
}
```

```bash
# 3.3 Create experiment with rollout disabled (50/50 split)
cat <<'EOF' > experiment.json
{
  "feature": "<feature-id>",
  "name": "Button Text Pilot v1",
  "hypothesis": "Changing button text increases clicks without increasing bounces.",
  "metrics": [{ "metric": "M1", "expected_direction": "increase" }],
  "experiment_rollout": {
    "enabled": false,
    "rollout_percentage": 100,
    "multivariate_feature_state_values": [
      { "multivariate_feature_option": "<treatment-option-id>", "percentage_allocation": 50 }
    ]
  }
}
EOF

flagsmith api api/v1/environments/<dev-env-key>/experiments/ \
  --input experiment.json --jq '{id, status}'
```
```json
{
  "id": "E1",
  "status": "created"
}
```
```text
step 3 ✓ experiment created · status created · rollout off · split 50/50 · 1 metric attached
```

---

## Step 4: Pre-flight Gate

```bash
sh skills/flagsmith-experiment-to-rollout/scripts/preflight.sh \
  skill_demo_button_text submit get_started
```
```text
✓ logged in
✓ flag skill_demo_button_text enabled
✓ default is control
✓ variants submit and get_started exist
preflight passed — now confirm the manual items in references/preflight-checklist.md
```
```text
step 4 ✓ preflight passed (4 automated checks passed, 0 failures)
```

---

## Step 5: Start (Human Approval Gate)

```text
step 5 ? Start experiment "Button Text Pilot v1" in Development? (yes/no)
> yes
```

```bash
flagsmith api api/v1/environments/<dev-env-key>/experiments/E1/start/ -X POST --jq '.status'
```
```text
running
```
```text
step 5 ✓ experiment started · status: running
```

---

## Step 6: Monitor (SRM Check First)

```bash
# At scheduled evaluation: fetch exposure counts
# control (submit) = 108 exposures, treatment (get_started) = 102 exposures
node skills/flagsmith-experiment-to-rollout/scripts/srm.mjs --a 108 --b 102
```
```text
srm: ok (n=210, p=0.679)
```
```text
step 6 ✓ srm: ok (n=210, p=0.679) · guardrails ok · window open, no decision
```

---

## Step 7: Decide (Pre-registered Rule)

```bash
# At end of window: check Bayesian win probability
flagsmith api api/v1/environments/<dev-env-key>/experiments/E1/results/ \
  --jq '{lift: .results.payload.metrics[0].inference.get_started.lift, win_prob: .results.payload.metrics[0].inference.get_started.chance_to_win}'
```
```json
{
  "lift": 0.284,
  "win_prob": 0.982
}
```
Pre-registered rule: win probability > 95% and guardrails not degraded -> `get_started` is the confirmed winner.
```text
step 7 ✓ treatment wins by pre-registered rule (lift: +28.4%, win_prob: 98.2%)
```

---

## Step 8: Roll Out (Human Approval Gate) & Cleanup

```text
step 8 ? Roll "get_started" out to 100% in Development and end experiment? (yes/no)
> yes
```

```bash
# Re-weight flag to 100% treatment
flagsmith flag update skill_demo_button_text --weight get_started=100,submit=0

# Verify rollout in environment
flagsmith flag get skill_demo_button_text \
  --jq '{enabled: .enabled, value: .feature_state_value}'
```
```json
{
  "enabled": true,
  "value": "get_started"
}
```

```bash
# Open cleanup PR to remove conditional code
git checkout -b refactor/graduate-demo-button-text
# (agent replaces conditional with permanent "Get Started" text)
gh pr create --title "refactor: graduate skill_demo_button_text to permanent feature" \
  --body "Removes conditional flag check following confirmed A/B test winner."
```
```text
step 8 ✓ get_started rolled out to 100% · cleanup PR #46 opened
```

---

## Step 9: Rollback (Safety Ready)

If any production error occurred during rollout:
```bash
flagsmith flag update skill_demo_button_text --weight submit=100,get_started=0
```
Instantly reverts 100% of traffic back to `"submit"` within 200ms across all edge nodes.
