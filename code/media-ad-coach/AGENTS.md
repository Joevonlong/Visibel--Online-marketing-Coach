# Visibel — agent operating contract

This file is the single source of truth for any AI coding assistant (Claude Code, Codex, …)
working inside this repository. `CLAUDE.md` is a pure `@AGENTS.md` import — edit THIS file
only, never fork per-runtime instructions.

## What this repo is

**Visibel — "From Zero to Hero."** Paste a local business's links → AI experts score
the text and images customers actually see → a channel list shows what to improve → one
click "Do It For You" rewrites copy, generates concept images, and reveals a Before/After
optimized page. Built for {Tech: Europe} × Almedia, Berlin 2026-07-18. This directory is
NOT its own git repo — the event folder `projects/AI-Hackthon-2026-07-18` is one unified
repository; run all git commands from that root.

Authoritative planning docs live in the parent event folder (same machine/checkout):

- **Live handoff status (READ FIRST when resuming):** `docs/STATUS.md` (in this repo)
- Implementation plan (scope authority): `../../docs/team-idea/final-implement-plan/impelemet-plan.md`
- Feature breakdown (per-feature specs): `../../docs/team-idea/final-implement-plan/feature-breakdown.md`
- **Live status (update your rows!):** `../../docs/team-idea/final-implement-plan/FEATURE-TRACKER.md`
- Team lane split: `docs/TEAM-SPLIT.md` (in this repo)
- Module interface cards: `docs/CONTRACTS.md` (in this repo) — read before consuming another lane's module

## Environment

```sh
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"   # node 22 + pnpm 11 (corepack)
pnpm dev        # http://localhost:3000
pnpm build      # production build — must pass before any merge
pnpm test       # vitest run — full suite must stay green
pnpm check-env  # live OpenAI + Tavily key smoke (fails loudly without .env — that is correct)
```

Copy `.env.example` → `.env` and fill keys locally. **No secrets in tracked files, ever.**
Without keys: LIVE audits fail honestly; `DEMO_MODE=replay` (or `?mode=replay`) drives the
full demo offline from the fixture.

## Hard rules (from the frozen plan — do not relitigate)

1. **`lib/schemas.ts` is FROZEN.** Any change needs explicit agreement from both lanes first.
2. **Models never compute totals.** All scores/priorities come from `lib/rubric.ts` (pure TS).
3. **Truth discipline:** never hide a failed live call behind fixture content; every
   generated image carries the `AI concept` badge; LIVE/REPLAY badges always truthful;
   Tavily integration is never cut (errors → honest error chip, judgments labeled ASSUMPTION).
4. **Serialized files** — one open writer at a time, announce before touching:
   `package.json` + lockfile · `lib/schemas.ts` · `lib/db.ts` · `app/globals.css` ·
   `app/layout.tsx` · `components/primitives/*`.
5. Work only inside your lane's owned paths (see `docs/TEAM-SPLIT.md`). Merge gate before
   any commit to `main`: `pnpm exec tsc --noEmit` + `pnpm test` + `pnpm build` all green.
   `main` is always demo-runnable.
6. Update your feature rows in `FEATURE-TRACKER.md` in the same breath as merging.
7. Video analysis/generation is OUT OF SCOPE (v2 removal) — `promo_video` stays a disabled
   "Coming soon" row; do not build more, do not fake it.

## Issue discipline (mandatory)

Every defect found — by a human, a review, or live testing — is registered in
`docs/ISSUES.md` BEFORE any fix is written: ID, status, root cause, concrete fix method,
touched files, and a regression guard. Update the issue's status in the same change that
lands its fix. This registry is how reverted fixes get detected and re-applied; never fix
silently.

## Feature discipline (mandatory)

Every new requirement — from the human or from analysis — is broken down into feature
entries in `docs/FEATURES.md` BEFORE any implementation: ID, status, acceptance criteria,
owned paths. Implementers only build from `TODO` entries and flip status in the same
change that lands the code; a real end-to-end run promotes `BUILT` to `VERIFIED`. This is
the ONLY path for new functionality — no unregistered implementation. Defects go to
`docs/ISSUES.md` instead ("does the wrong thing" = issue; "should do something new" =
feature).

**Branch standard (mandatory):** one feature = one branch. Create `feat/fea-<id>-<slug>`
from the main branch (git root is the event folder `projects/AI-Hackthon-2026-07-18`),
implement and verify ON the branch (acceptance + `pnpm exec tsc --noEmit` + `pnpm test` +
`pnpm build`), then merge back into main, resolving ALL conflicts in the merge — main
stays demo-runnable at every moment. Implementing several features concurrently means
each gets its OWN branch cut from main (never from another feature branch), merged back
independently after its own verification. Sequential work follows the same loop: branch →
implement → verify → merge → next feature. Issue fixes follow the SAME mandatory
pattern: one issue = one branch `fix/iss-<id>-<slug>` cut from main, developed and
verified on the branch, merged back with conflicts resolved before the next issue starts.

## Repo conventions (learned the hard way — follow them)

- **Relative imports** (`../lib/...`) in all `lib/**` and `tests/**` files — vitest has no
  `@/` path resolution here; `@/` only works inside Next-compiled `app/**` code.
- Tests point storage at temp dirs via `APP_DB_PATH` (SQLite file) and `APP_STORAGE_DIR`
  (uploads/images root). Never let tests write the real `storage/`.
- OpenAI Structured Outputs: `zodResponseFormat` (from `openai/helpers/zod`) works with
  zod v4, but ONLY on plain-object roots — call it with the individual per-channel rewrite
  schemas, never the `RewriteOutput` union.
- Model-facing schemas use `nullable`, not `optional` (strict mode requires all keys).
- Progress steps: the `AnalyzeProgressStep` enum has no `failed` value; `audits.status ===
  "failed"` is authoritative, and pollers ignore unrecognized progress steps defensively.
- Next.js 15 route handlers: `params` is async (`const {id} = await params`).
- Tailwind v4 is CSS-first: theme lives in `app/globals.css` `@theme`; there is NO
  tailwind.config file and none may be created. Use token classes (`bg-surface-alt`,
  `text-ink`, `border-hairline`, `text-display`, …) and `components/primitives/*`.
