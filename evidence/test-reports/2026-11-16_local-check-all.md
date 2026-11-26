# Local test report · 16 Nov 2026 · `npm run check:all`

**Local run on the build machine (macOS 27.2.1 arm64, Node 26.13.0, npm 11.20.0, Chrome 157.0.8103.51).** Not CI:
the Linux CI workflow (`.github/workflows/ci.yml`) has never run. Simulated network: these checks fake Flagsmith
locally and prove the app's behaviour, not Flagsmith's ingestion (that is validated in Development, flagsmith/SETUP.md §2).

Run after a clean `rm -rf node_modules dist && npm ci` from the lockfile; exit code 0.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` (Vitest) | Test Files  39 passed (39) · Tests  644 passed (644) |
| `npm run check:isolation` | Measurement isolation: ok (35 source files, 8 rules, index.html clean) |
| `npm run check:secrets` | No-secrets check: ok (136 files, no dist/ yet; .gitignore and env names ok) |
| `npm run check:frozen` | Freeze check: no measured-v1 tag yet; the measured files are not frozen. (Pass --require at release.) |
| `npm run check:release` | FAILS as designed: `measured-v1` tag does not exist yet (exit 1) |
| `npm run build` | ok |
| `npm run check:browser` | 64/64 checks passed · dev server · Chrome 157.0.8103.51 |
| `npm run check:browser:prod` | 68/68 checks passed · production build with deploy headers · Chrome 157.0.8103.51 |
| `npm run check:arms` | All layouts identical between arms |

## Browser checks, dev server (verbatim)

```
ok    UI-1 landing makes no Flagsmith request before Start
      0 requests
ok    I-1 Start identifies with Flagsmith (faked locally)
ok    UI-2 focus moves to the card title on every result
      6/6
ok    UI-2 Lock in is disabled until a call is chosen
      6/6
ok    UI-2 keys 1–4 select a call
      6/6
ok    26 §3 at 1280 × 800 every single-metric card, Lock in included, fits above the fold
      S3 776px, S1 776px, S5 776px, S2 776px, S4 776px, S6 1029px
ok    UI-3 each locked call is saved before the next card shows
      5/5
ok    UI-4 Space skips the flip to its end state
ok    UI-5 ←/→ move through the debrief to the readout
ok    UI-7 the clipboard holds exactly the Rules Markdown
      1364 chars
ok    UI-7 "Copied" is announced in a live region
ok    UI-10 the whole journey, landing to readout and Rules copy, ran on the keyboard alone
ok    I-4 exactly one $flag_exposure for the run
      1
ok    I-6 the four score events, then one Rules-copied event
      $flag_exposure, readout_score, readout_completed, readout_loss_call, readout_near_miss_call, readout_rules_copied
ok    I-2 every event carries the stored identity
ok    no request left for any host other than (faked) Flagsmith
ok    TT-1 Start in two tabs at once: one identity, one Flagsmith identify
      1 identify request(s), 1 identity
ok    TT-1 both tabs follow the one attempt
ok    TT-2 two tabs lock the same card at once: exactly one answer is stored, index 1
      index 1, answers {"S3":"ship"}
ok    TT-2 the losing tab says the challenge moved on in another tab
      notice in tabs: 0, 1
ok    TT-3 both tabs on the last card; six answers stored, no seventh
      S6/S6 · 6 answers
ok    TT-3 completion in two tabs at once: the four score events are sent exactly once
      readout_score 1, readout_completed 1, readout_loss_call 1, readout_near_miss_call 1
ok    TT-3 one payload, built from the stored answers, status sent_1
      sent_1
ok    TT-4 Rules copied in two tabs at once: one M5 event
      1
ok    TT-4 revisiting in two tabs re-sends no scores
      1
ok    TT-4 delivery updates from two tabs leave the answers and payload untouched; send 1 recorded ok
      send1 ok
ok    TT every event from both tabs carries the one identity
ok    UI-1 desktop 1280×800: H1, Start and the whole study notice are above the fold
      H1 ends at 189px, Start button ends at 785px, study notice ends at 717px of 800
ok    UI-1 phone 375×812: H1 and the start of the study notice above the fold, Start directly after the notice
      notice starts 353px, Start at 919px (24px after it)
ok    UI-9 phone 320×568: the practice badge is on every practice screen
      7/7
ok    phone 320×568: Lock in is on screen (sticky) on every card after choosing
      6/6
ok    phone 320×568: every call option and Lock in is at least 44 × 44 px
ok    phone 320×568: the S4 and S6 cards render without overflow
ok    UI-9 phone 320×568: practice makes zero Flagsmith requests
      0
ok    UI-9 phone 375×812: the practice badge is on every practice screen
      7/7
ok    phone 375×812: Lock in is on screen (sticky) on every card after choosing
      6/6
ok    phone 375×812: every call option and Lock in is at least 44 × 44 px
ok    phone 375×812: the S4 and S6 cards render without overflow
ok    UI-9 phone 375×812: practice makes zero Flagsmith requests
      0
ok    tablet 768×1024: the flip grid is 2 × 3
      2 columns
ok    tablet 1024×768: the flip grid is 3 × 2
      3 columns
ok    UI-4 reduced motion: the flip runs no transform animation
      0 transform animation samples
ok    UI-8 presenter ←/→ move between results
      Result 1 of 6 → Result 2 of 6 → Result 1 of 6
ok    UI-8 presenter F flips the inference line
      "p-value·0.27" → "Chance to beat control·86%"
ok    UI-8 presenter R reveals the answer
ok    UI-8 presenter Esc returns to the team guide
ok    UI-8 the presenter makes zero Flagsmith requests
      0
ok    F-1 Flagsmith unreachable: the landing explains it within 4 s and offers practice
      119 ms
ok    F-1 Flagsmith unreachable: no measured run starts; the practice run is labelled
      stayed on landing: true, badge: true, now at /practice
ok    F-1 Flagsmith unreachable: no events sent
      0
ok    F-9 flags slower than 4 s: the landing explains it within 4 s and offers practice
      4362 ms
ok    F-9 flags slower than 4 s: no measured run starts; the practice run is labelled
      stayed on landing: true, badge: true, now at /practice
ok    F-9 flags slower than 4 s: no events sent
      0
ok    desktop 1280×800: the finished run's pages make no Flagsmith request
      0
ok    desktop 1440×900: the finished run's pages make no Flagsmith request
      0
ok    tablet 768×1024: the finished run's pages make no Flagsmith request
      0
ok    tablet 1024×768: the finished run's pages make no Flagsmith request
      0
ok    phone 320×568: the finished run's pages make no Flagsmith request
      0
ok    phone 375×812: the finished run's pages make no Flagsmith request
      0
ok    phone 412×915: the finished run's pages make no Flagsmith request
      0
ok    axe WCAG 2.1 A/AA: 0 serious or critical across 84 page × viewport runs
ok    every button and toggle on every page is at least 44 × 44 px on touch screens
ok    no horizontal scroll on any page at any of 7 viewports
ok    no Content-Security-Policy violation on any page
64/64 checks passed · dev server · Chrome 157.0.8103.51
```

## Browser checks, production build (verbatim)

```
ok    UI-1 landing makes no Flagsmith request before Start
      0 requests
ok    I-1 Start identifies with Flagsmith (faked locally)
ok    UI-2 focus moves to the card title on every result
      6/6
ok    UI-2 Lock in is disabled until a call is chosen
      6/6
ok    UI-2 keys 1–4 select a call
      6/6
ok    26 §3 at 1280 × 800 every single-metric card, Lock in included, fits above the fold
      S3 776px, S1 776px, S5 776px, S2 776px, S4 776px, S6 1029px
ok    UI-3 each locked call is saved before the next card shows
      5/5
ok    UI-4 Space skips the flip to its end state
ok    UI-5 ←/→ move through the debrief to the readout
ok    UI-7 the clipboard holds exactly the Rules Markdown
      1364 chars
ok    UI-7 "Copied" is announced in a live region
ok    UI-10 the whole journey, landing to readout and Rules copy, ran on the keyboard alone
ok    I-4 exactly one $flag_exposure for the run
      1
ok    I-6 the four score events, then one Rules-copied event
      $flag_exposure, readout_score, readout_completed, readout_loss_call, readout_near_miss_call, readout_rules_copied
ok    I-2 every event carries the stored identity
ok    no request left for any host other than (faked) Flagsmith
ok    TT-1 Start in two tabs at once: one identity, one Flagsmith identify
      1 identify request(s), 1 identity
ok    TT-1 both tabs follow the one attempt
ok    TT-2 two tabs lock the same card at once: exactly one answer is stored, index 1
      index 1, answers {"S3":"control"}
ok    TT-2 the losing tab says the challenge moved on in another tab
      notice in tabs: 1, 0
ok    TT-3 both tabs on the last card; six answers stored, no seventh
      S6/S6 · 6 answers
ok    TT-3 completion in two tabs at once: the four score events are sent exactly once
      readout_score 1, readout_completed 1, readout_loss_call 1, readout_near_miss_call 1
ok    TT-3 one payload, built from the stored answers, status sent_1
      sent_1
ok    TT-4 Rules copied in two tabs at once: one M5 event
      1
ok    TT-4 revisiting in two tabs re-sends no scores
      1
ok    TT-4 delivery updates from two tabs leave the answers and payload untouched; send 1 recorded ok
      send1 ok
ok    TT every event from both tabs carries the one identity
ok    UI-1 desktop 1280×800: H1, Start and the whole study notice are above the fold
      H1 ends at 189px, Start button ends at 785px, study notice ends at 717px of 800
ok    UI-1 phone 375×812: H1 and the start of the study notice above the fold, Start directly after the notice
      notice starts 353px, Start at 919px (24px after it)
ok    UI-9 phone 320×568: the practice badge is on every practice screen
      7/7
ok    phone 320×568: Lock in is on screen (sticky) on every card after choosing
      6/6
ok    phone 320×568: every call option and Lock in is at least 44 × 44 px
ok    phone 320×568: the S4 and S6 cards render without overflow
ok    UI-9 phone 320×568: practice makes zero Flagsmith requests
      0
ok    UI-9 phone 375×812: the practice badge is on every practice screen
      7/7
ok    phone 375×812: Lock in is on screen (sticky) on every card after choosing
      6/6
ok    phone 375×812: every call option and Lock in is at least 44 × 44 px
ok    phone 375×812: the S4 and S6 cards render without overflow
ok    UI-9 phone 375×812: practice makes zero Flagsmith requests
      0
ok    tablet 768×1024: the flip grid is 2 × 3
      2 columns
ok    tablet 1024×768: the flip grid is 3 × 2
      3 columns
ok    UI-4 reduced motion: the flip runs no transform animation
      0 transform animation samples
ok    UI-8 presenter ←/→ move between results
      Result 1 of 6 → Result 2 of 6 → Result 1 of 6
ok    UI-8 presenter F flips the inference line
      "p-value·0.27" → "Chance to beat control·86%"
ok    UI-8 presenter R reveals the answer
ok    UI-8 presenter Esc returns to the team guide
ok    UI-8 the presenter makes zero Flagsmith requests
      0
ok    F-1 Flagsmith unreachable: the landing explains it within 4 s and offers practice
      125 ms
ok    F-1 Flagsmith unreachable: no measured run starts; the practice run is labelled
      stayed on landing: true, badge: true, now at /practice
ok    F-1 Flagsmith unreachable: no events sent
      0
ok    F-9 flags slower than 4 s: the landing explains it within 4 s and offers practice
      4352 ms
ok    F-9 flags slower than 4 s: no measured run starts; the practice run is labelled
      stayed on landing: true, badge: true, now at /practice
ok    F-9 flags slower than 4 s: no events sent
      0
ok    desktop 1280×800: the finished run's pages make no Flagsmith request
      0
ok    desktop 1440×900: the finished run's pages make no Flagsmith request
      0
ok    tablet 768×1024: the finished run's pages make no Flagsmith request
      0
ok    tablet 1024×768: the finished run's pages make no Flagsmith request
      0
ok    phone 320×568: the finished run's pages make no Flagsmith request
      0
ok    phone 375×812: the finished run's pages make no Flagsmith request
      0
ok    phone 412×915: the finished run's pages make no Flagsmith request
      0
ok    axe WCAG 2.1 A/AA: 0 serious or critical across 84 page × viewport runs
ok    every button and toggle on every page is at least 44 × 44 px on touch screens
ok    no horizontal scroll on any page at any of 7 viewports
ok    deploy: the CSP and security headers are on every page
ok    deploy: deep links are served the app shell (SPA rewrite)
ok    deploy: hashed assets are cached as immutable
      public, max-age=31536000, immutable
ok    no Content-Security-Policy violation on any page
ok    no console error on any page (production build)
68/68 checks passed · production build with deploy headers · Chrome 157.0.8103.51
```
