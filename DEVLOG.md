# Development log

What was built, in order, and every decision that changed the plan. Planning documents (the numbered research files)
are referred to by number. Pre-event building was permitted (confirmed to the project owner by the organisers);
the Production experiment and all evidence are event-only, from 26 Nov 2026 08:00 IST.

## 13 Nov 2026 · Plan

- Final pre-build checklist and risk register. Readout's six scenarios were reproduced from Flagsmith's own `stats.py`
  (repo commit `64c1ebe`) and an independent derivation; largest difference 4.4 × 10⁻¹⁶.
- Consent moved before identity: **nothing reaches Flagsmith before Start** (34 §4.1). Guardrails get four reporting
  categories and pre-registered margins instead of "not losing" (34 §3).

## 14–16 Nov 2026 · Build (Development environment only)

### Foundations
- Vite 5, React 18, TypeScript (strict), Tailwind 4, Vitest. Dependencies pinned; `@flagsmith/flagsmith` 12.4.0.
- **Statistics:** a TypeScript port of Flagsmith's `stats.py`, tested against `scripts/check_stats.py`, an
  independent Python derivation written from closed forms (`src/stats/__fixtures__/reference.json`).
- **Scenarios:** the defensible call for each result is derived in code from the Rules (T-KEY), not typed in.
  - **Decision (33 C-19):** the planned measured order put S2 and S6 ("Keep the control" both) next to each other,
    breaking the plan's own rule. The T-KEY test caught it; the order became S3, S1, S5, S2, S4, S6, before any
    pre-registration.
- Tailwind migration: one stylesheet (`src/styles/index.css`) holding the theme tokens; class recipes in
  `components/ui/classes.ts`; screenshots compared pixel-identical before and after.

### The study machinery
- **Attempt store:** one persisted record per browser, strictly validated; a corrupt record becomes void, never a
  second attempt; every write guarded against other tabs.
- **Controller:** the attempt is saved before the exposure; the scores are saved, then the send is claimed, then
  tracked. A send happens only if the SDK is really ready for that identity.
  - **Bug found:** `MeasuredSession` was not inside a `FlagsmithProvider`, so the exposure was never recorded. The
    real-SDK, fake-network tests caught it.
- **Delivery (33 C-18):** Flagsmith's docs warn retries can inflate Mean metrics, so "re-sending identical values
  changes nothing" was not assumed. A delivery monitor wraps the SDK's `fetch` and records the real HTTP outcome per
  batch, allowing for the SDK's one retry. A batch is re-sent once, on a later visit, only if it was observed to fail;
  an unknown outcome is never re-sent.
- **No StrictMode:** its double mount would record the exposure twice in Development.

### Screens
- Landing with the consent block and "Practise without being measured"; the challenge and practice runs; the flip
  (timed reveal, skippable, reduced-motion aware); six debriefs; the readout; the Rules page with Markdown copy;
  the team guide; a presenter view for a shared screen; About (privacy, the study behind a spoiler guard, the six
  pre-written outcomes); not-found and error screens; print styles (the team guide fits one page).
  - **Bug found:** the inference line had lost its ref in the Tailwind migration, so the flip never rotated.

### Verification
- **Measurement scope:** with the real routes and the real SDK, only a live measured run contacts Flagsmith; every
  other page, practice and a finished attempt make zero requests. Confirmed live once in Development: a delivered
  attempt plus four page loads made zero requests.
- **Arm invariance:** the measured page is byte-identical between the arms once the inference line's text is removed,
  at all six positions; in real Chrome, every element box matches at 320, 375, 768 and 1280 px.
  - The layout instrument itself needed four rounds of noise fixes (Chrome's 500 px minimum window, animations caught
    mid-way, pages measured before CSS, font loading). Each was found by comparing an arm with itself. The tolerance
    is 2 px, the measured same-arm noise floor; a wrapped line moves things by 20 px or more.
- **M5 on the wire:** one Rules-copied event per measured identity, only after its scores were sent and only when the
  clipboard took the text.
- **Repo checks:** measurement isolation and no-secrets scripts, each tested by planting violations.
- **Real-browser check** (Chrome via `playwright-core`, axe-core, Flagsmith faked locally). It found six things jsdom
  could not, all fixed:
  1. Start sat 43 px below the fold at 1280 × 800.
  2. The practice flip, debrief and readout had no practice badge.
  3. Grey text on the amber evidence highlight was 4.0:1 (3.1:1 where two overlap); it now steps up a shade.
  4. The framing toggle was 36–40 px tall on touch screens; now 44 px.
  5. "Leave" was 37 px wide; now 44 px.
  6. The debrief index was 36 px wide per segment at 320 px; below 360 px it now wraps into two rows.
- **Mutation testing** after each batch: deliberately broken copies of the code, each of which a test must catch.
  Survivors led to stronger tests (for example, a later visit's Rules copy must not even start Flagsmith).

### Production build (task 35)
- The build fails without `VITE_FLAGSMITH_ENV_NAME`, and refuses a production deploy context unless it is
  `production`. The Development debug panel is absent from production bundles.
- `vercel.json` and `netlify.toml`: SPA rewrite for deep links, a strict Content-Security-Policy (only this site and
  the two Flagsmith hosts; no inline code, no eval), `no-referrer`, no framing, immutable hashed assets.
- The browser check runs against the production build served with those exact headers: zero CSP violations, zero
  console errors.
  - **Bug found in our own tooling:** the local static server escaped the dot inside `(.*)`, so every deep link
    returned 404. The check caught it on its first run.
- README, EXPERIMENT.md (the pre-registration) and this log.

### Upgrades A, C, D
- **A, recruitment:** channel tags and message templates in one module (`content/recruitment.ts`), used by the app's
  own share and team links; `npm run links` prints them for a URL; RECRUITMENT.md holds targets only. A test keeps
  every message sent before the final refresh free of words that would give the experiment away.
- **C, impact evidence:** `npm run impact` turns a real event export into a pooled, labelled report (traps, rules
  broken, patterns, Rules copies). It refuses a Production file containing Development check events, and counts each
  attempt once. Whether Flagsmith offers an export of event metadata is not yet verified.
- **D, work tool:** a test now ties the review template to the six Rules and four calls.
  - **Bug found:** the template's `<name>` placeholder is an HTML tag to GitHub, so it vanished when pasted into a
    pull request. Now `[experiment name]`.

### Competitive sprint (16 Nov): audit findings, each reproduced first
- **Rollout (confirmed):** practice and the presenter were hard-wired to `p_value`. Now a Start that Flagsmith does
  not enrol passes on the environment's flag value as their default, with no new request and no exposure.
- **M5 delivery (confirmed):** the guard was set before the send and the outcome ignored. Now recorded as pending,
  then as the observed outcome; failed or unconfirmed copies are re-sent once (safe for an Occurrence metric).
- **Cross-tab race (confirmed):** `createAttempt` and `ensureUid` were read-then-write, so two tabs could start two
  attempts under two IDs. Start and every send claim now run under a Web Lock; without the API, practice only.
- **Privacy wording (confirmed):** "anonymous" and "no personal data" overclaimed. The copy now says the ID is random
  and links exposure to calls, that request data such as the IP address reaches Flagsmith, and how a reset works.
  The longer consent pushed Start 33 px below the fold; the browser check caught it and the text was tightened.
- **Freeze (confirmed missing):** `scripts/check-frozen.mjs`, `check:release`, a Linux CI workflow. No tag yet: the
  repository has no commits.
- **Chrome path (confirmed):** the arm check read `CHROME`, the rest `CHROME_PATH`; one resolver now, Linux paths too.
- Clean `npm ci` from the unchanged lockfile, then every check.

## Still to do

- Flagsmith setup in the authorised workspace (metrics M1–M5, the Development experiment, the live V-checks), only
  with the account owner's authorisation.
- Manual pass on Firefox, Safari and real phones; the browser check covers Chrome only.
- Deploy, recruitment, the Production experiment from 26 Nov 08:00 IST, results, video, submission.
