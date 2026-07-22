# Demo Contract — Visibel

> Authority: one of the four authoritative Run artifacts. Revision 2, frozen for the non-Lane-A completion slice.

- Claim status: `FACT` for the checked-in `REPLAY` flow; `UNKNOWN` for venue `LIVE` calls until credentials and a real smoke test exist.
- Primary execution mode: `REPLAY`
- Supported execution modes: `LIVE`, `REPLAY`, `HANDOFF_REQUIRED`
- MVP revision: `3`
- Fixture revision: `2`
- UI/API contract revision: `1`
- Target viewport: `1440x900` desktop
- External capability applicable: `true` — OpenAI, Tavily, and Cognee are load-bearing in `LIVE` mode.
- Hosted release applicable: `false` for this completion run — no public deployment or provider-console mutation is authorized.
- Local URL: `http://localhost:3000`
- Ten-second takeaway: **Visibel turns one local-business website into an evidence-backed ad audit and improved creative, while visibly labeling live and replayed evidence.**

## Ownership and acceptance

- Owner: `mission-control`
- Backend owned paths: `code/media-ad-coach/app/api/**`, `code/media-ad-coach/lib/**` except `lib/client/**` and frozen `lib/schemas.ts`
- Excluded ownership: every Lane A path in `code/media-ad-coach/docs/TEAM-SPLIT.md`
- Acceptance: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, root `pnpm verify`, and `pnpm secret:scan`
- Independent reviewer: `reviewer`

## Two-minute judge flow

| Time | Operator action | Expected evidence |
|---|---|---|
| 00:00 | Open the landing page and name the local-business problem | The promise is legible within ten seconds |
| 00:10 | Enter `https://sanitaer-krause.example` and start the audit | Loading/progress state and request identity are visible |
| 00:30 | Open the completed audit | Score, findings, evidence, provenance, and `REPLAY` label are visible |
| 00:55 | Show the before/after creative | Original evidence and generated improvement are visually comparable |
| 01:20 | Trigger or explain improve | Image and copy output retain execution-mode and fallback labels |
| 01:40 | Show history/memory context | Prior-audit count is truthful; Cognee unavailability is shown as degraded, never hidden |
| 01:55 | Close | “A trustworthy ad coach for businesses that cannot afford an agency.” |

## Golden fixture and fallback

1. Start with `pnpm dev` in `code/media-ad-coach`.
2. Use the Sanitär Krause case from `lib/replay/fixtures/audit-golden.json`.
3. If a `LIVE` provider is unavailable, switch visibly to `REPLAY` within ten seconds.
4. Say: **“The live provider is unavailable in this environment, so this result is the checked-in replay fixture, not a live call.”**
5. Never describe a replayed provider response or generated asset as live.

## Capability boundary

| Capability | Expected mode | Current proof | Fallback | Claim |
|---|---|---|---|---|
| Audit orchestration | `LIVE` / `REPLAY` | Focused tests and golden replay fixture | `REPLAY` | `FACT` |
| OpenAI copy/vision/image | `LIVE` when keyed | No venue credential smoke yet | Fixture/generated placeholder with explicit mode | `UNKNOWN` live, `FACT` replay |
| Tavily evidence search | `LIVE` when keyed | Captured replay evidence | Captured replay evidence | `UNKNOWN` live, `FACT` replay |
| Cognee cross-audit memory | `LIVE` when keyed | Adapter and deterministic degraded behavior | SQLite prior-audit count plus visible degraded status | `UNKNOWN` live, `FACT` fallback |
| Public deployment/submission | `HANDOFF_REQUIRED` | Not authorized | Local build and runbook | `UNKNOWN` |

## Required visible states

The frozen experience requires: golden, pivot, loading, empty, error, degraded, and replay. Lane A owns their judge-visible rendering. Backend contracts must preserve explicit progress, error, execution mode, replay provenance, and degraded-provider data for those states.

## Rehearsal record

| Run | Checkpoint | Duration | Replay/Wi-Fi-off | Result |
|---|---|---:|---|---|
| 1 | pending integrated checkpoint | pending | required | pending |
| 2 | pending integrated checkpoint | pending | required | pending |
| 3 | pending integrated checkpoint | pending | required | pending |

Three timed rehearsals, the recorded two-minute video, public repository visibility, and organizer submission require the integrated Lane A UI and/or human authorization. Until then they remain `HANDOFF_REQUIRED`, not completed evidence.

## Submission checklist

- [ ] Integrated UI proves all seven visible states at `1440x900`
- [ ] Three timed rehearsals pass from one checkpoint, including Wi-Fi-off `REPLAY`
- [ ] Two-minute demo video is recorded from that checkpoint
- [ ] Reviewer independently verifies code, truth labels, replay, and submission copy
- [ ] Human authorizes and performs public repository/submission mutations
- [ ] Organizer receipt is captured separately from the prepared submission package
- [ ] Final `pnpm verify` and `pnpm secret:scan` pass
