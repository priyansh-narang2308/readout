# Rollback (any time, after approval)

Send everyone to control in the environment default:

```sh
flagsmith flag update <f> --weight <c>=100,<t>=0
flagsmith flag get <f> --jq '[.multivariate_feature_state_values[]? | .percentage_allocation]'
```

Then end the experiment (console, or its API endpoint) and add a dated "Rolled back: <reason>" line to
`experiments/<name>.md`. If the flag itself is faulty, `flagsmith flag disable <f>` turns it off entirely.
