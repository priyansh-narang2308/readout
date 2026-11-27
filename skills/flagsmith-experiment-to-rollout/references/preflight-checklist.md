# Pre-flight checklist (step 4)

Automated by `scripts/preflight.sh <feature> <control> <treatment>`:

- [ ] CLI is logged in (`auth status` succeeds)
- [ ] the feature exists in the target environment and is enabled
- [ ] its default value is the control
- [ ] both variants exist

Manual (answer yes to each, in one line):

- [ ] `experiments/<name>.md` is committed and dated before the start
- [ ] the experiment reads back `created`, rollout disabled, split 50/50, primary metric attached first
- [ ] no exposures recorded yet
- [ ] the wiring PR is merged and deployed, and the app build points at this environment's client-side key
- [ ] nobody on the team will play or send test events in this environment once it starts (Production)
