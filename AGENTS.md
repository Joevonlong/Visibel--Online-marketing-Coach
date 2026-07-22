# Agent operating contract — AI Hackathon 2026-07-18

This file is the single source of truth for AI coding assistants working in this repository. **Codex** reads `AGENTS.md` natively; **Claude Code** loads it through `CLAUDE.md`, which is a pure `@AGENTS.md` import. Change behavior by editing this file only — never fork per-runtime instructions.

## Mission

Ship the smallest truthful, runnable, judge-visible proof for the {Tech: Europe} x Almedia "The Summer Lock-In" hackathon (Berlin, 2026-07-18): a 2-minute video demo plus a public GitHub repository, submitted before the 19:00 deadline. Judging (Open Innovation track): 50% technical execution, 30% creativity & wow factor, 20% real problem. At least one partner technology (OpenAI / Tavily / Cognee) must carry weight in the hero flow, not decorate it.

## Repository layout

- `README.md` — event index and single entry point. Update its layout table whenever a new top-level content area is added.
- `docs/2026-07-18_AI-Hackthon-description/` — official event materials, saved verbatim. Never rewrite or "improve" official sources.
- `docs/team-idea/` — team brainstorming, plans, and proposals produced during the event.
- `runs/` — HDOS run state, one subfolder per run (see `runs/README.md`).
- `code/` — product implementation. Tracked as part of THIS repository — the event folder is one whole git repo (decision 2026-07-18: no nested product repos). All product changes under `code/media-ad-coach/` are committed here.

Resolve the target folder before writing any file; nothing event-related lives outside these areas.

## Working rules

1. **English only.** All new content in this repository is written in English (official materials stay as received).
2. **Truth labels.** In planning and analysis docs, mark claims as `FACT`, `ASSUMPTION`, or `UNKNOWN`. Never present an assumption as a verified fact, and never hide a failed live call behind canned output.
3. **No secrets in the repo.** API keys and tokens live only in a local `.env` (template: `.env.example`). Never write real values into tracked files, docs, or evidence.
4. **Smallest truthful slice.** Prefer a runnable end-to-end tracer bullet over speculative infrastructure, generic template screens, or decorative dashboards.
5. **Keep the index current.** Any new top-level docs subfolder or content area gets a row in the `README.md` layout table in the same change.
6. **Issue discipline.** Defects in the product are tracked in `code/media-ad-coach/docs/ISSUES.md`. Register before fixing; fix from the list; update status in the same change; a real end-to-end run promotes `FIXED` to `VERIFIED`. Discovery (scanning) and fixing are decoupled — the registry is the only queue between them.
7. **Feature discipline.** New capability is tracked in `code/media-ad-coach/docs/FEATURES.md`. Every new requirement is broken down into feature entries there before any implementation; implementers build only from `TODO` entries and update status in the same change. The event-time `FEATURE-TRACKER.md` stays frozen as the historical record.
8. **Branch discipline.** One registry entry = one branch from main: `feat/fea-<id>-<slug>` for features, `fix/iss-<id>-<slug>` for issue fixes. Implement and verify on the branch, merge back to main with all conflicts resolved; concurrent items branch independently from main, never from each other. Main stays runnable at every moment.

## Runtimes and tooling

- **Codex**: discovers this `AGENTS.md` at the repository root.
- **Claude Code**: `CLAUDE.md` contains only `@AGENTS.md`; both runtimes therefore share this one contract.
- **HDOS platform** (roles, skills, `pnpm hdos:*` commands) lives in the parent `AI_Hackthon_workspace` and runs from the workspace root. Create runs for this event with `pnpm hdos:init -- --run projects/AI-Hackthon-2026-07-18/runs/<run-id>`.
