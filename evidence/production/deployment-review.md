# Production deployment review (prepared, not deployed)

17 Nov 2026. Nothing was deployed, pushed or published. No host account was signed in to or changed.

## Build against the Production configuration

A production build was made into a scratch folder outside the repository, with `CONTEXT=production`,
`VITE_FLAGSMITH_ENV_NAME=production` and a **placeholder** key (not a real key; the Production key was not requested
or used), then scanned:

| Check | Result |
|---|---|
| Build | succeeds (`vite build`, 335 kB JS / 106 kB gzip) |
| Development key (from `.env`) in the bundle | **absent** (0 files) |
| The key given to the build | present once (the client-side key ships in the bundle by Flagsmith's design) |
| Admin API key, `Api-Key …`, `ser.…` server key, `FLAGSMITH_ADMIN…` | absent |
| Flagsmith hosts in the bundle | `edge.api.flagsmith.com` (flags), `events.api.flagsmith.com` (events), `realtime.flagsmith.com` (SDK constant only; `realtime: false`), and two docs links |
| Environment name compiled in | `production`: debug logging off, the DEV chip replaced by the hidden `data-env="production"` marker |
| Guard: production context with `VITE_FLAGSMITH_ENV_NAME` missing or `development` | build refuses (existing) |

## Hazard found and fixed

**Before:** a production-context build with no Production key given (for example a local `vercel build --prod` or
`netlify build --context production`) silently took `VITE_FLAGSMITH_ENV_KEY` from the local `.env`, which is the
**Development** key. Reproduced: exit 0, the Development key in the bundle, labelled production. Players would have
been measured in Development.

**Fix:** `vite.config.ts` (not a frozen file) now refuses a production deploy context with no key, or with the key
from `.env`, without printing either. `src/build-guard.test.ts` builds throwaway projects to prove both refusals, the
Vercel context too, and that a build with its own key ships no Development key; mutation-checked (removing the guard
fails the test).

## Configuration reviewed (no change needed)

| Area | Finding |
|---|---|
| Public vs private variables | Only `VITE_FLAGSMITH_ENV_KEY` (client-side, public by design), `VITE_FLAGSMITH_ENV_NAME`, `VITE_REPO_URL` reach the bundle. Admin keys exist only in the owner's shell for the two scripts. `.gitignore` keeps `.env*` (except `.env.example`), `dist`, `.vercel`, `.netlify` out; `check:secrets` scans source and `dist` |
| Environment selection | `envName()` is `production` only when built so; the build guard ties it to the host context both ways |
| SPA routing | `vercel.json` rewrite and `netlify.toml` redirect send every path to `index.html`; `deploy.test.ts` keeps them identical; `check:browser:prod` tests deep links on a production build |
| CSP and headers | `default-src 'self'`, `script-src 'self'`, `connect-src 'self' edge.api + events.api.flagsmith.com`, `frame-ancestors 'none'`, nosniff, DENY, no-referrer, COOP; `check:browser:prod` requires zero CSP violations and zero console errors |
| Event connectivity | Events go to `events.api.flagsmith.com` (allowed); the delivery monitor tracks that host; the landing page makes no Flagsmith request before Start |
| Error handling | Flagsmith unreachable or slower than 4 s → labelled practice, no events (`check:browser` failure scenarios) |
| Privacy | A random browser ID on Start, no name, email or account; the plain explanation is `KIT.privacy` in `src/content/recruitment.ts`; Practice sends nothing |

## Host: not verified

No host is linked on this machine (no `.vercel` or `.netlify` folder) and the repository has no remote, so the host,
the project's permissions and its environment variables could not be checked. Before deploying, the owner chooses
Vercel or Netlify and sets, **for the production context only**: `VITE_FLAGSMITH_ENV_NAME=production`,
`VITE_FLAGSMITH_ENV_KEY=<Production client-side key>` (in the host's dashboard, never in a file), `VITE_REPO_URL` once
public. Preview contexts get the Development values. A git-based host build needs the repository pushed, which is
outside this phase. Deploying is an external publication and waits for the owner's approval.
