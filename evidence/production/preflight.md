# Production preflight (read only)

**Production · no traffic · not started.** Inspected on 17 Nov 2026 (~17:00 IST) in the account owner's signed-in
Flagsmith dashboard, 2.291.0, by viewing pages only: nothing was saved, created, enabled or sent. No keys, project,
environment, feature, option, segment or identity IDs are recorded here.

The API-side confirmation of the same facts is the GET-only `scripts/flagsmith-prepare-production.mjs --dry-run`
(owner's run; its sanitized transcript goes in [`api/`](api/)). Until that run, the rows below rest on the dashboard only.

## Findings

| Check | Found | Pass? |
|---|---|---|
| Project and environment | Project `readout`, environment named **Production** (the other environment is Development) | pass |
| Feature `readout_framing` | Present, multivariate, **enabled** in Production; the only feature (1 of 1) | pass |
| Control value | `p_value`, 100% (the unallocated remainder) | pass |
| Treatment value | Variation `chance_to_win`, value `chance_to_win`, **environment weight 0%** | pass — matches EXPERIMENT.md §2 ("weight 0, the experiment sets the allocation") |
| Rollout state | No segment overrides (0), no identity overrides (0), no experiment, so every identified Production user gets `p_value` | pass |
| Warehouse | A **Flagsmith-managed** warehouse connection exists, status **Pending Connection** (amber dot); last event received "-", total events 0, unique events 0 | **not Connected** — see below |
| Metrics | None in Production | pass (nothing to reuse; M1–M5 to be created) |
| Experiments | None in Production ("No experiments yet") | pass |
| Segments | No user segments in the project (Development's experiment rollout segment is a hidden system segment of that environment) | pass |
| Identities | One: Flagsmith's own auto-created example identity (created for every environment; never used by Readout) | pass |
| Readout traffic | 0 events received in Production; no Readout identities | pass |
| Reusable resources | The feature and its two values (project-level, shared with Development, already validated). Nothing else exists to reuse | — |

## Warehouse: why it is "Pending Connection", and why that is correct before launch

From Flagsmith's source at tag v2.291.0 (`api/experimentation/services.py`):
- A managed (`flagsmith`) connection moves `created → pending_connection` when its connection test is run
  (`mark_warehouse_pending_connection`), and `pending_connection → connected` only in
  `refresh_warehouse_connection_status`, **when the warehouse has received at least one event** for the environment.
- Event ingestion (`store_sdk_experimentation_events`) and results (`compute_results_summary`, which reads the
  environment's first warehouse connection) do **not** check the connection status.

So Production will show **Connected** only after its first event. Sending one now would be a Production event before
launch, which is not allowed (no synthetic or test traffic in Production). Nothing is missing from the configuration:
the connection exists, it is the managed type (no credentials), and it is waiting for its first event.

**G-1 is therefore re-stated:** before launch, "managed warehouse connection present, Pending Connection, 0 events"
(this file); after the first real player, "Connected, events received" (launch checklist, step L-7). Development shows
the same path worked (Connected, 21+ events).

## Implication for the experiment preparation

The feature's environment default already has `chance_to_win` at weight 0, so creating the experiment (which resets
the default weights to 0 on its first rollout) changes nothing there. See
[preparation-safety.md](preparation-safety.md) for what creating it does change, and why it is created disabled.
