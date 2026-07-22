# Visibel — Unified Feature Tracker

> **This is the single status list for the whole team.** Every feature from
> [`feature-breakdown.md`](feature-breakdown.md) has exactly one row here. Update your row
> when its state changes — nowhere else. Scope questions → [`impelemet-plan.md`](impelemet-plan.md).

## How we work (git workflow — mandatory)

1. **`main` is always demo-runnable.** Never commit directly to `main` (exception: the
   hour-0 scaffold commits F-001–F-003 that create the repo).
2. **One branch per feature**: `feat/<id>-<slug>` (e.g. `feat/f020-website-evidence`).
   Rows that must land together on serialized files share one branch — the Branch column
   is the authority.
3. **Before merging**: run the feature's acceptance check from the breakdown doc, plus
   `pnpm build` (and `pnpm test` whenever `lib/rubric.ts` or `lib/schemas.ts` is touched).
   A branch that breaks the demo does not merge.
4. **Merge → update this file.** Merge into `main`, delete the branch, flip your row's
   Status in the same or the very next commit. Stale tracker = broken coordination.
5. **Serialized files — only ONE open branch may touch them at a time** (announce in team
   chat before opening): `package.json` + lockfile · `lib/schemas.ts` · `lib/db.ts` ·
   design tokens (`globals.css`/tailwind theme) · app shell/layout ·
   `components/primitives/*`.
6. **Schema freeze**: `lib/schemas.ts` (F-006) is frozen at hour 0. Any change after the
   freeze needs an explicit OK from all of A, B, C before the branch opens.
7. **Owners**: A = Frontend · B = Pipeline · C = Improve engine + agents · D = Floater.
   The row owner is the only person who edits that row.

**Status values:** `TODO` → `IN PROGRESS` → `TESTING` → `MERGED` · plus `BLOCKED (why)`
and `DROPPED (kill line)`. Nothing else.

**Target** = schedule window from plan §7 (T0 = coding start): T0=0:00–0:30 ·
T1=0:30–1:30 tracer · T2=1:30–2:30 · T3=2:30–3:30 · T4=3:30–4:15 polish ·
T5=4:15–5:00 submit · pre-T0 = before coding starts.

⚠ = never-cut / truth-critical item (Tavily, preview, truth labels, honest failures).

---

## E0 · Foundation (serialized — merge before anything else)

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-001 | App scaffold (Next.js 15 + TS, repo `code/media-ad-coach/`) | P0 | C | T0 | `feat/f001-scaffold` | — | MERGED |
| F-002 | Dependencies (Tailwind v4, shadcn, sqlite, zod, openai, tavily, sharp, cheerio) | P0 | C | T0 | `feat/f001-scaffold` | F-001 | MERGED |
| F-003 | `.env.example` + gitignore (no secrets ever) | P0 | C | T0 | `feat/f001-scaffold` | F-001 | MERGED |
| F-004 | `scripts/check-env.ts` live key smoke (OpenAI + Tavily) ⚠ | P0 | B | T0 | `feat/f004-check-env` | F-003 | MERGED |
| F-005 | `lib/db.ts` SQLite + 4 tables | P0 | B | T0 | `feat/f005-db` | F-002 | MERGED |
| F-006 | `lib/schemas.ts` frozen zod schemas (hour-0 contract) ⚠ | P0 | C | T0 | `feat/f006-schemas` | F-002 | MERGED |
| F-007 | Design tokens (Apple-style, §6.1, frozen T0) | P0 | A | T0 | `feat/f007-design-system` | F-002 | MERGED |
| F-008 | UI primitives (pill, card, section, nav, badges, severity dot) | P0 | A | T0 | `feat/f007-design-system` | F-007 | MERGED |

## E1 · Rubric engine (pure TS — models never compute totals)

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-010 | Rubric constants T1–T8 / I1–I6 + bands | P0 | C | T0 | `feat/f010-rubric-core` | F-006 | MERGED |
| F-011 | Lane scoring math (missing evidence → 0 + row) | P0 | C | T1 | `feat/f010-rubric-core` | F-010 | MERGED |
| F-012 | Overall score 50/50 + band | P0 | C | T1 | `feat/f010-rubric-core` | F-011 | MERGED |
| F-013 | Findings derivation (≤2 + red flags, quotes mandatory) | P0 | C | T1 | `feat/f010-rubric-core` | F-010 | MERGED |
| F-014 | Image coverage check → gap channels | P0 | C | T2 | `feat/f014-channels` | F-013 | MERGED |
| F-015 | Channel derivation (fixed 12-channel catalog) | P0 | C | T2 | `feat/f014-channels` | F-013 | MERGED |
| F-016 | Priority = impact²/effort + pinning (site first, video last) | P0 | C | T2 | `feat/f014-channels` | F-015 | MERGED |
| F-017 | Cross-platform NAP consistency (deterministic) | P0 | C | T2 | `feat/f017-nap` | F-015, F-023 | MERGED |
| F-018 | Rubric unit tests (exact totals — stop-ship) | P0 | C | T2 | `feat/f018-rubric-tests` | F-012, F-016 | MERGED |

## E2 · Evidence pipeline

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-020 | Website fetch + cheerio → WebsiteEvidence | P0 | B | T1 | `feat/f020-website-evidence` | F-006 | MERGED |
| F-021 | Tavily Extract fallback ⚠ | P0 | B | T1 | `feat/f020-website-evidence` | F-020 | MERGED |
| F-022 | Unreachable-site honest path ⚠ | P0 | B | T1 | `feat/f020-website-evidence` | F-021 | MERGED |
| F-023 | Portal evidence (Gelbe Seiten / Check24, read-only) | P0 | B | T2 | `feat/f023-portal-evidence` | F-021 | MERGED |
| F-024 | Google Maps input handling (Tavily corroboration) | P0 | B | T4 | `feat/f024-gbp` | F-028 | MERGED |
| F-025 | GBP screenshot vision extraction + precedence | P0 | B | T4 | `feat/f024-gbp` | F-030, F-041 | MERGED |
| F-026 | Image harvest + sharp normalize (8 largest) | P0 | B | T1 | `feat/f026-image-harvest` | F-020 | MERGED |
| F-027 | Pasted text + uploaded images ingestion | P0 | B | T2 | `feat/f027-manual-ingest` | F-026, F-041 | MERGED |
| F-028 | Tavily findability check (every LIVE audit) ⚠ | P0 | B | T1 | `feat/f028-findability` | F-004 | MERGED |
| F-029 | Zero-usable-images path (absence = top finding) | P0 | B | T2 | `feat/f026-image-harvest` | F-026 | MERGED |

## E3 · Expert agents

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-030 | `openai.ts` structured-call helper (1 retry) | P0 | C | T1 | `feat/f030-agents` | F-006 | MERGED |
| F-031 | `prompts.ts` prompt library (Appendix B) | P0 | C | T1 | `feat/f030-agents` | — | MERGED |
| F-032 | Copy Strategist (T1–T8, exact quotes, doctor flags) | P0 | C | T1 | `feat/f030-agents` | F-030, F-031 | MERGED |
| F-033 | Visual Director (I1–I6 per image, gaps, red flags) | P0 | C | T1 | `feat/f030-agents` | F-030, F-026 | MERGED |
| F-034 | Synthesizer (summary + one-liners, may not change numbers) | P0 | C | T2 | `feat/f034-synthesizer` | F-032, F-033, F-015 | MERGED |

## E4 · API + orchestration

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-040 | POST /api/audits (create + validation) | P0 | B | T1 | `feat/f040-audit-api` | F-005, F-006 | MERGED |
| F-041 | POST /api/audits/:id/assets (multipart) | P0 | B | T2 | `feat/f041-assets-api` | F-040 | MERGED |
| F-042 | POST /api/audits/:id/analyze → 202 async | P0 | B | T1 | `feat/f040-audit-api` | F-040 | MERGED |
| F-043 | Analyze orchestrator (5 stages + progress events) | P0 | B | T1 | `feat/f043-orchestrator` | F-020, F-026, F-028, F-032, F-033, F-012 | MERGED |
| F-044 | GET /api/audits/:id (status/progress/report) | P0 | B | T1 | `feat/f040-audit-api` | F-043 | MERGED |
| F-045 | POST /api/audits/:id/improve (one or "all") | P0 | B+C | T2 | `feat/f045-improve-api` | F-050 | MERGED |
| F-046 | GET /api/audits (history rows) | P0 | B | T4 | `feat/f046-history-api` | F-040 | MERGED |

## E5 · "Do It For You" engine (the wow)

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-050 | Text channel rewrites (parallel ≤5, channel-specific afters) | P0 | C | T2 | `feat/f050-text-improve` | F-030, F-015 | MERGED |
| F-051 | gpt-image-1 generation (cap 3, trade presets) | P0 | C | T3 | `feat/f051-image-gen` | F-030 | MERGED |
| F-052 | `AI concept` labels + shot briefs ⚠ | P0 | C | T3 | `feat/f051-image-gen` | F-051 | MERGED |
| F-053 | Generation failure ladder (briefs + real photos) ⚠ | P0 | C | T3 | `feat/f051-image-gen` | F-051 | MERGED |
| F-054 | Preview assembly (`preview_json` + what-changed) ⚠ | P0 | C | T3 | `feat/f054-preview-assembly` | F-050, F-051 | MERGED |
| F-055 | Improve orchestration (status flips, "all" → complete) | P0 | C | T3 | `feat/f054-preview-assembly` | F-045, F-054 | MERGED |

## E6 · Frontend — the three-page product

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-060 | Landing `/` (hero, 3 cards, sample-report link) | P0 | A | T2 | `feat/lane-a-wave1` | F-008, F-081 | MERGED |
| F-061 | Input §A general info (brand, trade pills, city) | P0 | A | T2 | `feat/lane-a-wave1` | F-008 | MERGED |
| F-062 | Input §B presence URLs (icons, validation, +add) | P0 | A | T2 | `feat/lane-a-wave1` | F-008 | MERGED |
| F-063 | Input §C attachments (textarea, dropzone ≤10, GBP slot) | P0 | A | T2 | `feat/lane-a-wave1` | F-008 | MERGED |
| F-064 | Input validation + submit flow (≥1 link OR attachment) | P0 | A | T2 | `feat/lane-a-wave1` | F-040, F-041, F-042 | MERGED |
| F-065 | Analyzing state (progress checklist, 1 s poll) | P0 | A | T1 | `feat/lane-a-wave1` | F-044, F-081 | MERGED |
| F-066 | Score header (count-up, band, lane cards, weights) | P0 | A | T1 | `feat/lane-a-wave1` | F-044, F-081 | MERGED |
| F-067 | Context chips (findability ⚠ / coverage / reputation) | P0 | A | T2 | `feat/lane-a-wave1` | F-066 | MERGED |
| F-068 | Evidence highlights (worst quotes + images, tappable) | P0 | A | T2 | `feat/lane-a-wave1` | F-066 | MERGED |
| F-069 | Action strip ("N things…" + Do It For You) | P0 | A | T3 | `feat/lane-a-wave2` | F-070 | MERGED |
| F-070 | Channel rows (states todo/improving/improved) | P0 | A | T2 | `feat/lane-a-wave2` | F-044, F-081 | MERGED |
| F-071 | Pinned rows (site top / promo_video "Coming soon") | P0 | A | T2 | `feat/lane-a-wave2` | F-070 | MERGED |
| F-072 | Inline reveals (text before/after; images + badge ⚠) | P0 | A | T3 | `feat/lane-a-wave2` | F-070, F-045 | MERGED |
| F-073 | "Your new page is ready" sticky bar | P0 | A | T3 | `feat/lane-a-wave2` | F-072 | MERGED |
| F-074 | Preview overlay `/audit/[id]/preview` ⚠ never cut | P0 | A | T3 | `feat/lane-a-wave2` | F-054, F-081 | MERGED |
| F-075 | Before panel ("what customers see today") | P0 | A | T3 | `feat/lane-a-wave2` | F-074 | MERGED |
| F-076 | Split view (draggable divider, toggle, changed-chips) | P0 | A | T3 | `feat/lane-a-wave2` | F-074 | MERGED |
| F-077 | History page `/history` | P0 | A | T4 | `feat/lane-a-wave1` | F-046 | MERGED |
| F-078 | LIVE / REPLAY badges everywhere truthful ⚠ | P0 | A | T4 | `feat/lane-a-wave3` | F-080 | MERGED |
| F-079 | Apple polish pass (bounded, T3:30–4:15 only) | P0 | A | T4 | `feat/lane-a-wave3` | all E6 | MERGED |

## E7 · Execution modes & fixtures

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-080 | LIVE/REPLAY switch (`DEMO_MODE` / `?mode=replay`) ⚠ | P0 | C | T1 | `feat/f080-replay-mode` | F-081 | MERGED |
| F-081 | Fixture skeleton (renders at T0:30) | P0 | C | T0 | `feat/f001-scaffold` | F-006 | MERGED |
| F-082 | Full fixture from real run (incl. Tavily + images) ⚠ | P0 | C+D | T5 | `feat/f082-full-fixture` | F-055, F-100 | MERGED (recorded from completed LIVE audit `90e9b6c4-ea09-4755-90c3-20621409c660`: Tavily, structured scoring from 8 source images, 3 publishable concepts, 9 channel afters; third-party binaries and rejected edit withheld) |

## E8 · Cognee memory (P1 — must attempt, never fake)

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-090 | `memory/cognee.ts` (2 calls, 10 s timeout, never throws) ⚠ | P1 | C | T4 | `feat/f090-cognee` | F-043 | MERGED |
| F-091 | Memory line + "memory: Cognee" chip (real hits only) ⚠ | P1 | C+A | T4 | `feat/f090-cognee` | F-090, F-034 | BLOCKED (implementation and tests pass; no Cognee URL/key available for the required real retrieval, so the line correctly stays absent) |
| F-092 | Seed 2–3 audits during rehearsal | P1 | D | T5 | — (no code) | F-090 | BLOCKED (seed/verifier script ready; needs Cognee credentials + 2–3 completed LIVE audits) |

## E9 · Other P1 bonuses (only after all P0 green)

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-095 | Playwright real Before screenshot | P1 | B | T4+ | `feat/f095-screenshot` | F-075 | MERGED (LIVE target captured and visually verified at 1440×900; 458 KiB PNG, SHA-256 recorded, plus automated tests) |
| F-096 | gpt-image-1 edits of real photos (`enhanced`, cap 5) | P1 | C | T4+ | `feat/f096-image-edit` | F-051 | BLOCKED (implementation/tests and 3 LIVE provider calls succeeded, but manual review rejected every output for changing factual content beyond relight/recrop; no output is shipped) |
| F-097 | SSE streaming progress (replaces polling) | P1 | B | T4+ | `feat/f097-sse` | F-044, F-065 | MERGED (SSE endpoint, EventSource client, fallback, focused tests, production build, and real browser stream consumption pass) |

## E10 · Demo, docs & submission

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-100 | Pick + verify 2–3 real weak test sites | P0 | D | pre-T0 | — (no code) | — | MERGED |
| F-101 | Product README (partners, boundary, no-video note) ⚠ | P0 | D | T5 | `feat/f101-readme` | F-082 | MERGED |
| F-102 | 3 rehearsals incl. Wi-Fi-off REPLAY drill | P0 | D | T5 | — (no code) | F-082 | BLOCKED (3 automated production REPLAY drills pass, incl. browser-egress isolation, and 1 LIVE acceptance run passes; physical Wi-Fi-off/venue rehearsal requires a human operator) |
| F-103 | 2-minute demo video | P0 | D | T5 | — (no code) | F-102 | MERGED (39.20 s publishable truthful REPLAY WebM covers Landing → Input → 43/100 Score → Do It For You → Before/After; third-party source binaries withheld; upload remains F-104) |
| F-104 | Public repo + submit before 19:00 | P0 | D | T5 | — (no code) | F-101, F-103 | BLOCKED (public repo verified; official organizer submission page still says form TBA, and no public video-upload destination/receipt is available) |

## P2 backlog (do not start unless everything above is green)

| ID | Feature | P | Owner | Target | Branch | Depends on | Status |
|---|---|---|---|---|---|---|---|
| F-110 | Cognee deeper usage | P2 | C | — | `feat/f110-cognee-deep` | F-091 | BLOCKED (resilient add/find wrapper, live-only seed verifier, and tests pass; real provider acceptance needs Cognee URL/key) |
| F-111 | PDF export | P2 | C | — | `feat/f111-pdf` | F-054 | MERGED (focused test, production build, and real browser download pass; generated artifact has a valid PDF header) |
| F-112 | Multi-page preview (services subpage) | P2 | A | — | `feat/f112-multipage` | F-074 | MERGED |

---

## Kill lines (from plan §7 — record the decision here if triggered)

| Trigger | Action | Affected rows |
|---|---|---|
| T+90: tracer not through | Image harvesting drops to uploads-only | F-026 → DROPPED, F-027 stays |
| T+165: image generation unstable | Channels improve with shot briefs + best real photos; **preview never cut** (text-only After) | F-051 degraded via F-053; F-074 stays |
| Venue Tavily API errors | Integration + README stay; chip shows honest error; judgments `ASSUMPTION`; REPLAY shows recorded call | F-028, F-067 — **never removed** |
| T+225: Cognee unstable | Keep wrapped calls behind env flag; demo without the line; never fake | F-090/F-091 → env-disabled |
| T+255 | **Feature freeze** — reliability only | everything not MERGED → DROPPED or P2 |

## Stop-ship checklist (mirror of plan §8 — check before submitting)

- [x] Three-page story works: Landing → Input (3 sections) → Recommendation; input → complete score ≤60 s
- [x] All totals computed by `rubric.ts`; unit test proves exact totals
- [x] Text findings quote real sentences (source-tagged); image findings show the actual photo; NAP inconsistency has its own row
- [x] Every weak item is a row; Improve It works per-row; Do It For You unlocks Before/After; promo_video visibly Coming soon
- [x] Preview renders assembled page; every generated image badged `AI concept`; "what changed" accurate
- [x] Tavily runs in every LIVE audit; README documents it as load-bearing
- [x] Cognee line only from real retrieval; absent key = silently disabled; README truthful
- [x] Refresh-safe (SQLite); history works; LIVE/REPLAY badges truthful everywhere
- [x] README complete; "video analysis/generation not implemented" stated; no secrets in repo
