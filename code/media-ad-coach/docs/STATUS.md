# Live handoff status — Visibel

> **Anonymization note (2026-07-22):** the LIVE audit referenced below ran
> against a real Berlin plumbing business; for publication its identity is
> replaced with the fictional "Rohrfuchs Berlin" persona (`*.example` URLs).
> See `docs/CONTENT-PROVENANCE.md`.

> Purpose: any operator (Claude Code or Codex) must be able to resume from this file
> alone. Mission Control (session 1) updates it at every wave gate. Per-feature statuses
> live in `../../../docs/team-idea/final-implement-plan/FEATURE-TRACKER.md`; this file is
> the narrative: what landed, what is in flight, exactly how to continue.
> Last update: 2026-07-18 final acceptance pass. Product code, a real LIVE-recorded fixture,
> screenshot/provider-attempt evidence, 252 tests, typecheck, production build, and three REPLAY
> rehearsals are green. Only external Cognee credentials, physical venue rehearsal, and the
> organizer submission form remain blocked.

## Environment facts (verified)

- Node via nvm: `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` (pnpm 11.7.0 via corepack).
- Local `.env` has working OpenAI and Tavily credentials; `pnpm check-env` passed and one
  isolated production LIVE audit completed. Cognee URL/key are absent, so memory remains
  truthfully disabled. No secret values were committed.
- Git: the EVENT repo `projects/AI-Hackthon-2026-07-18` is one unified repository (branch `main`); `code/media-ad-coach` is NOT a nested repo (decision 2026-07-18; old nested history archived outside the tree).

## Merged waves (all gated: tsc clean + full vitest + prod build green before commit)

| Wave | Features | Commit | Proof |
|---|---|---|---|
| Scaffold | F-001..F-003 | `bb7c9de` (pre-adoption) | build + placeholder render |
| Foundation | F-004..F-008, F-081 | `93c075a` (pre-adoption) | 22 tests |
| Engine | F-010..F-018, F-020..F-023, F-026, F-028/029, F-030..F-034, F-040..F-042, F-044, F-046 | `71b0a83` (pre-adoption) | 130 tests |
| Repo unification | (structure) | `65e3f9e` | 78 files adopted |
| Backend wave 2 | F-024/025/027, F-043, F-045, F-050..F-055, F-080, F-090 | `5140622` | 182 tests + E2E REPLAY smoke: create→analyze→scored(39)→improve all→complete+preview_ready |

| Handoff docs + mode:replay | `mode:"replay"` create override, STATUS.md | `c6a10e7` | 184 tests |
| Demo prep | F-100 (6 real sites fetch-verified; demo trio picked), DEMO-RUNBOOK.md | `5dca56e` | real fetches via own pipeline |
| Wave 3 | F-082 interim + F-101 (fixture w/ recorded afters + preview_json + images, record-fixture.ts, README) + deep-copy extraction rescue in website.ts (197→7370 chars on a real site) | `b1599f8` | 210 tests + REPLAY improve smoke: 8 channels flip improved |

## In flight right now

No product implementation remains in flight. External-only gates are listed below.

## Independent backend review (2026-07-18 ~16:40, read-only reviewer)

PASS — safe for the frontend lane to build against. The final gate is 252/252 tests,
clean typecheck, and a production build. Earlier review hand-verified rubric arithmetic,
traced Tavily/truth-label/REPLAY honesty paths, ran the
full E2E REPLAY smoke over HTTP (single-channel improve, improve-all, per-audit
`mode:"replay"` override with env unset, history), and scanned for secrets (clean).
Only finding: one stale CONTRACTS.md bullet (fixed in the same commit as this note).

## Lanes

- **Lane A frontend (F-060..F-079)** — complete.
- **Lane B+C backend** — complete, including the F-082 LIVE-recorded fixture.
- **External-gated**: F-091/F-092/F-110 need Cognee credentials; F-102 needs physical
  Wi-Fi-off/venue evidence; F-104 needs the still-TBA organizer form and a video upload/receipt.

## Open decisions / gaps a successor must know

1. `AnalyzeProgressStep` has no `failed` value — `audits.status === "failed"` is authoritative; pollers must ignore unknown steps (AGENTS.md convention; frontend must implement it).
2. F-082 truth state: the fixture was recorded from completed LIVE audit
   `90e9b6c4-ea09-4755-90c3-20621409c660`, includes Tavily plus three publishable
   AI-concept assets and structured scores from eight withheld source images, and has
   no fabricated Cognee memory line. The recorder only accepts LIVE audits, preserves
   distinct files, and the automated analyze → improve-all → preview walkthrough passes.
3. Cognee request/envelope shapes follow the official v1 docs and are isolated in `lib/memory/cognee.ts`; live tenant behavior is still UNKNOWN until venue credentials exist. The JSON completion inside `search_result` is model output, so the parser requires a positive numeric count + non-empty weakest lane and otherwise renders no memory line.
4. `POST /api/audits` accepts route-level extras not in frozen BusinessInput: `has_attachments?: true` (create-then-upload flow) and `mode?: "replay"` (per-audit REPLAY; used by the landing sample-report link).
5. Assets `storage_path` is stored RELATIVE to the storage root (`uploads/<id>/<file>`, `images/<id>/...`); resolve via `APP_STORAGE_DIR ?? <cwd>/storage`. Fixture asset paths are public URL paths (`/fixtures/...`) instead — served from `public/`.
6. Production build uses webpack (`next build`, NO --turbopack — turbopack prod build has a chunking TDZ bug here). Dev keeps turbopack. Route files export HTTP handlers ONLY; test-seam runners live in `lib/server/runners.ts`.
7. REPLAY improve flips nine channels from the recorded LIVE afters. Playback ignores the
   LIVE generation cap by design because it makes no generation calls.
8. Remaining open work is external: Cognee real-tenant acceptance, physical venue/Wi-Fi-off
   rehearsal, video upload, organizer form submission, and receipt.

## How to verify current state (the standing gate)

```sh
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd code/media-ad-coach
pnpm exec tsc --noEmit && pnpm test && pnpm build
# E2E REPLAY smoke (no keys needed):
DEMO_MODE=replay PORT=3100 pnpm start &
curl -s -X POST localhost:3100/api/audits -H 'content-type: application/json' \
  -d '{"brand_name":"Rohrfuchs Berlin","trade":"plumber","city":"Berlin","presence":{"website":"https://www.rohrfuchs-berlin.example/"}}'
# then POST /api/audits/<id>/analyze → poll GET /api/audits/<id> until scored
# then POST /api/audits/<id>/improve {"channels":"all"} → poll until complete + preview_ready
```

## Resume protocol for a fresh session (Claude or Codex)

1. Read this file, then AGENTS.md (conventions), then docs/CONTRACTS.md (interfaces), then FEATURE-TRACKER.md (per-feature truth).
2. Run the standing gate above — it must be green before you build anything.
3. Claim work: frontend → TEAM-SPLIT Lane A; backend leftovers → only what this file lists as open.
4. Never touch `lib/schemas.ts` (frozen), keep one writer per serialized file, gate before every commit, flip your tracker rows, and append your changes to this file's log below.

## Change log (append-only)

- 2026-07-18 wave gates: see "Merged waves" table above (session 1 / Mission Control).
- 2026-07-18 completion pass: Cognee calls aligned with the documented v1 Cloud API (`remember`, `search`, `X-Api-Key`), authored REPLAY memory fabrication removed, F-092 seed/recall verifier added, and F-082 recorder filename collisions + full offline walkthrough covered by tests. F-110's minimal deeper usage stores structured audit identity, both lane scores, weakness channels, and real improved-channel outcomes; recall preserves grounded shared weaknesses/improvements/explanation. External live-key gates remain explicitly blocked.
- 2026-07-18 final acceptance: LIVE Rohrfuchs audit completed under 60 seconds, real
  screenshot verified and provider image edits truthfully rejected after factual review,
  fixture re-recorded, 252 tests/typecheck/build passed, three REPLAY rehearsals passed,
  and the publishable 39.20-second demo video was regenerated.
