# Handoff — media-ad-coach-completion / EVIDENCE-P1 / completion-2026-07-18

> Supporting evidence only; keep the completed handoff below 8 KiB. Authority is domain-specific: the append-only event log owns chronological lifecycle history; `run.json` owns the current approved Run contract while its lifecycle fields are event-history projections; `mvp.json` owns scope and acceptance; `fixture.json` owns deterministic cases and provenance; and `demo.md` owns the demo and submission contract. `snapshot.json` is non-authoritative and rebuildable. If this handoff conflicts with the authority for the affected domain, stop and ask Mission Control.

## Truth-source map

| Domain | Authority | Use in this handoff |
|---|---|---|
| Execution history and recorded decisions | Append-only event log | Link the event; do not restate it as a new decision |
| Mission, rules, judging targets, constraints, budget, owners, artifact pointers | `run.json` | Reference its approved revision/hash |
| Current phase, task lifecycle, gates, approvals, blockers | Append-only event log; corresponding `run.json` lifecycle fields are projections | Reference event sequence and Run revision |
| Frozen scope, success criteria, experience and provider responsibilities | `mvp.json` | Reference its revision |
| Deterministic cases, replay provenance, expected states | `fixture.json` | Reference its revision and case ID |
| Timed story, recovery, rehearsal and submission contract | `demo.md` | Reference its revision |

## Route

- From owner: `mission-control / agent:mission-control`
- To owner: `human:event-operator and reviewer`
- Published at: `2026-07-18T14:28:41.502Z`
- Task status: `HANDOFF_REQUIRED`
- Execution mode: `LOCAL_DETERMINISTIC`, `REPLAY`, and `HANDOFF_REQUIRED`

## Frozen references

- `run.json` revision/event: `2 / 9 at publication start`
- `mvp.json` revision: `1`
- `fixture.json` revision: `1`
- `demo.md` revision: `1`
- UI/API contract path/revision: `ui-api-contract.json` / `1`
- Commit/build: `615e692381e82542dd8830a78e97bf9428894cde` / `synchronized base plus preserved shared working tree`

## Ownership transfer

Completed owner paths:

- `code/media-ad-coach/lib/pipeline/screenshot.ts` and its orchestrator persistence path
- `code/media-ad-coach/lib/improve/**` real-photo edit and preview assembly paths
- `code/media-ad-coach/lib/memory/cognee.ts` and `scripts/seed-cognee.ts`
- `code/media-ad-coach/app/api/audits/[id]/events/**` additive SSE route
- `code/media-ad-coach/lib/export/**` and `app/api/audits/[id]/report/**` PDF route
- Focused backend tests, replay fixture/recorder, contracts, runbook, tracker, and this Run's evidence

Next owner paths:

- Human event operator: LIVE credentials, target audit, Cognee seed/recall, physical Wi-Fi-off rehearsal, video, and submission
- Independent reviewer: read-only review of the integrated checkpoint and demo truth labels
- Lane A teammate: only the paths assigned in `code/media-ad-coach/docs/TEAM-SPLIT.md`

Serialized/shared paths that remain locked:

- `code/media-ad-coach/lib/schemas.ts`
- All Lane A pages, components, client helpers, global styling, primitives, and asset route named by `TEAM-SPLIT.md`

## Outcome

Summary: Non-Lane-A TODO code now includes persisted real-browser capture, real-photo image editing, additive SSE with polling compatibility, truthful Cognee v1 memory/seed handling, and Chromium PDF export. Local deterministic gates pass. Provider, venue, recording, publication, and submission proof remains handoff-required.

Judge-visible payoff: The integrated UI can consume real Before screenshots, improved media, streamed progress, grounded memory context, and downloadable reports while retaining a labelled offline replay path.

Outputs:

- `evidence/local-verification-2026-07-18.md` — command, repeatability, browser-smoke, and truth-boundary evidence
- `../../../code/media-ad-coach/docs/DEMO-RUNBOOK.md` — operator instructions and explicit external-action gates
- `../../../docs/team-idea/final-implement-plan/FEATURE-TRACKER.md` — per-feature implemented/testing/blocker truth

## Acceptance evidence

Command/check: `pnpm exec tsc --noEmit && pnpm test && pnpm build`, focused replay repeated three times, `git diff --check`, and a local Playwright Chromium screenshot smoke

Observed result: PASS — 16 test files / 246 tests, production build, three deterministic replay runs, and a 14,001-byte browser screenshot

Evidence path/URL/request ID: `evidence/local-verification-2026-07-18.md`

## Truth and risk ledger

### FACT

- The event branch and `origin/main` both resolved to `615e692381e82542dd8830a78e97bf9428894cde` with ahead/behind `0/0` before this evidence was recorded.
- TypeScript, all 246 tests, production build, three focused replay runs, and local Chromium screenshot launch/capture passed.
- Provider credentials were absent, so no result in this handoff is labelled LIVE.

### ASSUMPTION

- The provider adapters follow their documented contracts and injected-fake tests; validate them against the event tenant before making a LIVE claim.

### UNKNOWN

- Cognee/OpenAI/Tavily tenant behavior, venue network, and real target-site capture — human event operator before demo.
- Final video, public URL, organizer submission URL, and receipt — human event operator before the official deadline.

Never infer a `LIVE` result from `LOCAL_DETERMINISTIC` or `REPLAY` evidence.

## Decisions and deviations

- Approved decisions used: user instruction to sync origin and complete every non-Lane-A TODO; frozen Run decision in `run.json` revision 2.
- Interface or scope deviation: P2 F-110/F-111 code was implemented because the user's direct completion instruction superseded the earlier conditional backlog order; F-112 remains excluded as Lane A.
- Dependency/provider/release change: Playwright was added locally for browser capture/PDF generation; no external resource, credential, deployment, or provider spend was created.

## Next action

1. Integrate the teammate's Lane A checkpoint and run the standing product gate from a clean event commit.
2. With approved credentials, run one LIVE target audit, `scripts/seed-cognee.ts`, and re-record F-082 without replacing a failed LIVE result with replay.
3. Perform the physical Wi-Fi-off rehearsal, independent review, recording, and only then the authorized publication/submission steps.

Stop condition: Return to Mission Control on any failed clean-checkpoint gate, provider error, contract mismatch, or truth-label discrepancy.

Open blocker or external action: `HANDOFF_REQUIRED — human:event-operator and independent reviewer`
