# CLI recipes

`@flagsmith/cli` 2.0.0. Context comes from `flagsmith.json` (`flagsmith init`) or `-p/--project` and
`-e/--environment`. Every read ends in `--jq` so only the needed fields come back.

Placeholders: `<f>` feature name, `<c>`/`<t>` control/treatment variant keys, `<env>` environment client-side key,
`<id>` experiment id.

## 0. Context check (no secrets)

```sh
flagsmith auth status --jq '.organisation'
flagsmith environment list --jq '.[] | "\(.name) \(.api_key)"'   # client-side keys are public by design
```

## 1. Feature with two variants

`variants.json` (control is the environment default; treatment starts at 0%):

```json
[{ "value": "<c>", "weight": 100 }, { "value": "<t>", "weight": 0 }]
```

```sh
flagsmith feature create <f> --description "Experiment: <name>" --value "<c>" --enabled --variants @variants.json
flagsmith feature get <f> --jq '{type: .type, variants: [.multivariate_options[] | .string_value]}'
```

Check the shape of `variants.json` against `flagsmith feature create --help` and `flagsmith feature variant add --help`
before the first run; if the field names differ, use `feature variant add` per variant.

## 2. Metrics

```sh
flagsmith api api/v1/environments/<env>/experiment-metrics/ --input metric.json --jq '{id, name}'
flagsmith api api/v1/environments/<env>/experiment-metrics/ --jq '[.results[] | {id, name}]'
```

## 3. Experiment, rollout disabled

`experiment.json`:

```json
{
  "feature": <feature id>,
  "name": "<name>",
  "hypothesis": "<from experiments/<name>.md>",
  "metrics": [{ "metric": <primary metric id>, "expected_direction": "increase" }],
  "experiment_rollout": {
    "enabled": false,
    "rollout_percentage": 100,
    "multivariate_feature_state_values": [{ "multivariate_feature_option": <treatment option id>, "percentage_allocation": 50 }]
  }
}
```

```sh
flagsmith api api/v1/environments/<env>/experiments/ --input experiment.json --jq '{id, status}'
flagsmith api api/v1/environments/<env>/experiments/<id>/ \
  --jq '{status, rollout: .experiment_rollout.enabled, split: [.experiment_rollout.multivariate_feature_state_values[].percentage_allocation], metrics: (.metrics | length)}'
```

Expected: `status: "created"`, `rollout: false`, `split: [50]`, the metric count you planned.

## 4. Start (after approval)

```sh
flagsmith api api/v1/environments/<env>/experiments/<id>/start/ -X POST --jq '.status'
```

Expected: `running`. If the endpoint returns 404/405, start it in the Flagsmith console (Experiments › <name> ›
Start) and read back with the GET in §3.

## 5. Results and rollout (after approval)

Exposure counts and the primary metric are on the experiment's results page; take the two exposure counts for
`scripts/srm.mjs`. Roll the winner out to everyone (environment default):

```sh
flagsmith flag update <f> --weight <winner>=100,<loser>=0
flagsmith flag get <f> --jq '{enabled, weights: [.multivariate_feature_state_values[]? | .percentage_allocation]}'
```

Then end the experiment in the console (or its documented API endpoint) and read status back.

## 6. Clean up (after the cleanup PR is merged, after approval)

```sh
flagsmith feature update <f> --help   # confirm the archive flag name first
```

Archive, then `flagsmith feature list --jq '[.[] | select(.name=="<f>") | .is_archived]'`.
