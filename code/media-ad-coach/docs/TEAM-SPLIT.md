# Team lane split — two parallel operators

Two humans each drive their own Claude Code session in this repo. Lanes are cut so the two
sessions NEVER write the same file. Status truth stays in one place:
`../../docs/team-idea/final-implement-plan/FEATURE-TRACKER.md` — flip your own rows only.

## Already merged on `main` (do not rebuild)

E0 foundation (F-001..F-008), rubric engine + tests (F-010..F-018), evidence pipeline
(F-020..F-023, F-026, F-028, F-029), expert agents (F-030..F-034), audit APIs
(F-040..F-042, F-044, F-046), fixture skeleton (F-081). Full suite green (~130 tests).

## Lane B+C — Backend / engine (operator: session 1 — currently running)

| Features | What |
|---|---|
| F-043, F-024, F-025, F-027, F-080 | Analyze orchestrator (5 stages, progress events), Maps/GBP handling, manual ingest wiring, LIVE/REPLAY switch |
| F-045, F-050..F-055 | Improve engine: text rewrites, gpt-image-2 (cap 3, `AI concept` labels, failure ladder), preview_json assembly, improve route + orchestration |
| F-090, F-091 | Cognee wrapper + memory line (P1, never faked) |
| F-082 | Full REPLAY fixture (incl. fixture images) |

Owned paths: `lib/pipeline/*` (incl. orchestrator.ts, gbp.ts), `lib/improve/*`,
`lib/memory/*`, `lib/agents/*`, `lib/rubric.ts`, `lib/fixtures/*`,
`app/api/audits/[id]/improve/route.ts` (other api routes coordinate with session 1),
`scripts/*`, `tests/*` (backend test files).

## Lane A — Frontend (operator: session 2 — the second teammate, START HERE)

| Features | What |
|---|---|
| F-060 | Landing `/` (hero, 3 feature cards, sample-report link → REPLAY audit) |
| F-061..F-064 | Input `/audit/new`: 3 grouped sections (general info / presence URLs / attachments) + validation + submit flow (POST create → upload assets → POST analyze → route to `/audit/[id]`) |
| F-065..F-068 | Report page: analyzing checklist (1s poll), score header (count-up, band, lane cards, visible weights), context chips (findability/coverage/reputation), evidence highlights |
| F-069..F-073 | Action strip, channel rows (todo/improving/improved states), pinned rows (optimized_site top / promo_video "Coming soon" bottom), inline before/after reveals (AI-concept badges!), "your new page is ready" sticky bar |
| F-074..F-078 | Preview overlay (split view + draggable divider + what-changed chips), before panel, `/history`, LIVE/REPLAY badges everywhere |
| F-079 | Bounded Apple polish pass (last) |

Owned paths: `app/page.tsx`, `app/audit/**` (pages only, NOT api), `app/history/**`,
`components/input/*`, `components/report/*`, `components/preview/*`, `lib/client/*`,
frontend test files. Serialized-but-yours: `app/globals.css`, `app/layout.tsx`,
`components/primitives/*` (announce changes — backend never touches them).

### How to start session 2

1. Open Claude Code in `code/media-ad-coach/` (CLAUDE.md auto-loads the contract).
2. Read `docs/CONTRACTS.md` (API shapes + primitives) and plan §6 (the design spec).
3. Build against `lib/fixtures/replay-audit.json` + `DEMO_MODE=replay` from day one — the
   frontend needs zero backend progress to reach demo-grade. Backend endpoints land
   progressively on `main`; `git pull` often.
4. Before any commit: `pnpm exec tsc --noEmit` + `pnpm test` + `pnpm build` green.
   Git operates at the EVENT-REPO root (`projects/AI-Hackthon-2026-07-18` — one unified
   repo; this folder is not a nested repo).
5. Flip your rows in FEATURE-TRACKER.md when you merge.

## Shared / human tasks (decide together, Owner D in the tracker)

F-100 (pick 2–3 real weak test sites), F-092 (seed audits), F-102 (3 rehearsals),
F-103 (2-min video), F-104 (public repo + submit before 19:00). API keys: fill `.env`
locally on both machines; keys never enter the repo.

## Conflict rules

- `lib/schemas.ts` frozen — changes need BOTH lanes' explicit OK first.
- `package.json`/lockfile — announce in team chat before touching; one writer at a time.
- Backend never edits `app/**` pages or `components/**`; frontend never edits `lib/**`
  (except `lib/client/*`) or `app/api/**`.
- Merge conflicts should be structurally impossible; if one appears anyway, stop and talk.
