# Visibel — Feature Breakdown (from impelemet-plan.md v2)

> Source of truth for scope: [`impelemet-plan.md`](impelemet-plan.md) (v2, narrowed).
> This document decomposes that plan into single, individually buildable features.
> Live status lives in one place only: [`FEATURE-TRACKER.md`](FEATURE-TRACKER.md).
> Product code location: `code/media-ad-coach/` (its own git repository — the judge-facing
> submission repo). All file paths below are relative to that repo.

**Owners (team split from plan §7):**
**A** = Frontend (pages) · **B** = Pipeline (fetch/extract/harvest/vision/Tavily) ·
**C** = Improve engine + agents (rubric, rewrites, gpt-image-1, preview, fixtures) ·
**D** = Floater (test sites, README, video, submission).

**Priorities:** P0 = no demo without it · P1 = clear bonus · P2 = only if everything green.

---

## E0 · Foundation & scaffold (hour 0, serialized — one branch, one writer)

These features touch **serialized files** (`package.json`, lockfile, `lib/schemas.ts`,
`lib/db.ts`, design tokens, app shell). They merge first; everything else branches after.

#### F-001 · App scaffold — P0 · Owner C
- **Build:** `code/media-ad-coach/` as its own git repo. Next.js 15 App Router + TypeScript, pnpm, single process. Route skeleton per plan §5.2 (all `app/` pages + `api/` route stubs). `pnpm dev` → `http://localhost:3000`. Localhost only — no deployment.
- **Files:** entire repo skeleton per §5.2; `app/**`, `lib/**` (empty modules), `storage/` gitignored.
- **Accept:** fresh clone → `pnpm i && pnpm dev` renders a placeholder landing.

#### F-002 · Dependencies — P0 · Owner C
- **Build:** install + configure: Tailwind v4, shadcn/ui, framer-motion, `better-sqlite3`, `zod`, `openai`, `@tavily/core`, `sharp`, `cheerio`. Node 20+.
- **Files:** `package.json`, lockfile, `tailwind` config, `components.json`.
- **Accept:** `pnpm build` passes with all deps imported once.

#### F-003 · Env contract + gitignore — P0 · Owner C
- **Build:** `.env.example` with `OPENAI_API_KEY`, `TAVILY_API_KEY`, `COGNEE_API_KEY`/`COGNEE_API_URL` (optional, auto-disable), `DEMO_MODE=live|replay`, `OPENAI_MODEL_TEXT=gpt-4o`, `OPENAI_MODEL_VISION=gpt-4o`, `OPENAI_MODEL_IMAGE=gpt-image-1`. `storage/` (app.db, images/, generated/, tmp/) gitignored. **No secrets ever tracked.**
- **Files:** `.env.example`, `.gitignore`.
- **Accept:** repo contains zero real keys; models read from env everywhere.

#### F-004 · check-env startup smoke — P0 · Owner B
- **Build:** `scripts/check-env.ts` — verifies OpenAI + Tavily keys with a **live** smoke call at startup; fails loudly. (Schedule exit test T0:30: "both partner keys verified".)
- **Files:** `scripts/check-env.ts`.
- **Accept:** wrong/missing key → clear error; valid keys → passes in <10 s.

#### F-005 · SQLite layer — P0 · Owner B
- **Build:** `better-sqlite3` init, file `storage/app.db`, `CREATE TABLE IF NOT EXISTS` for the four tables in §5.3: `audits`, `assets`, `channels`, `progress_events` — exact columns incl. `status`, `execution_mode`, `label` (truth badges), `before_json`/`after_json`.
- **Files:** `lib/db.ts`.
- **Accept:** first boot creates DB + tables; audits survive process restart (refresh-safe stop-ship).

#### F-006 · Frozen zod schemas — P0 · Owner C · **FROZEN HOUR 0**
- **Build:** all schemas of Appendix A: `Criterion`, `Finding`, `Channel`, `Report` (incl. `findability`, `presence_coverage`, `reputation_chips`, `memory_note`, `execution_mode`, `disclaimers`), plus business-input schema, `WebsiteEvidence`, portal evidence block, improve output schemas. zod → OpenAI Structured Output derivation (one source of truth). **This is the frontend/backend parallel-work contract — changes after freeze require team agreement.**
- **Files:** `lib/schemas.ts`.
- **Accept:** schemas compile; REPLAY fixture parses through `Report` schema.

#### F-007 · Design tokens — P0 · Owner A · serialized
- **Build:** Apple-style tokens per §6.1: bg `#FFFFFF` / alt `#F5F5F7`; text `#1D1D1F`/`#6E6E73`; accent `#0071E3`; success `#34C759` (only for `improved`); system type stack, H1 56–72px semibold tracking-tight, section titles 40px, body 17px/1.5; pill buttons; `rounded-2xl` cards with hairline `#D2D2D7`, max `shadow-sm`; motion 200–300 ms ease-out; `prefers-reduced-motion` respected. Frozen at T0.
- **Files:** `app/globals.css`, tailwind theme config.
- **Accept:** tokens referenced by primitives, never re-declared per page.

#### F-008 · UI primitives — P0 · Owner A
- **Build:** built once, reused everywhere: `PillButton` (primary blue / quiet gray), `Card`, `Section`, sticky translucent `Nav` (backdrop-blur + hairline bottom border), `Badge` (LIVE / REPLAY SAMPLE / `AI concept` / `enhanced`), severity dot, criterion bar.
- **Files:** `components/ui/*` (shadcn), `components/primitives/*`.
- **Accept:** landing + recommendation page compose only from these primitives.

---

## E1 · Rubric engine (pure TS — models never compute totals)

#### F-010 · Rubric constants — P0 · Owner C · frozen hour 0
- **Build:** T1–T8 weights + anchors (§2.2 exactly: 20/15/15/15/10/10/10/5) and I1–I6 weights + anchors (§2.3: 20/20/20/15/15/10); score bands 85–100 Market Leader · 70–84 Strong · 50–69 At Risk · 30–49 Weak · 0–29 Invisible.
- **Files:** `lib/rubric.ts`.
- **Accept:** weights sum to 100% per lane; anchors match plan verbatim.

#### F-011 · Lane scoring math — P0 · Owner C
- **Build:** lane score = `Σ (criterion_score / 5 × weight) × 100`. Missing evidence → criterion scores **0** AND creates a channel row (absence is a verdict). Image lane aggregates per-asset I1–I6 (criteria_by_asset).
- **Files:** `lib/rubric.ts`.
- **Accept:** covered by F-018 unit tests.

#### F-012 · Overall score + band — P0 · Owner C
- **Build:** `OverallScore = 50% Text + 50% Image`, integer, band label attached. Backend computes all totals — model output that contains totals is ignored.
- **Files:** `lib/rubric.ts`.
- **Accept:** covered by F-018.

#### F-013 · Findings derivation — P0 · Owner C
- **Build:** every criterion ≤2 and every red flag → `Finding {id, lane, criterion, severity, evidence_quote, asset_ref?}`. Hard image red flags (foreign watermark, stock-as-own, privacy) force `high`. Missing Impressum/Datenschutz = instant `high` (T8).
- **Files:** `lib/rubric.ts`.
- **Accept:** finding always carries a quote or a named absence; never empty evidence.

#### F-014 · Image coverage check — P0 · Owner C
- **Build:** does the image set contain hero shot / team-person shot / work-proof shot / branding shot? Each missing category → its own channel row (drives channels, **not** the score). Zero usable images → top image finding (with F-029).
- **Files:** `lib/rubric.ts` (consumes Visual Director coverage output).
- **Accept:** demo site with no team photo yields `team_image` row.

#### F-015 · Channel derivation — P0 · Owner C
- **Build:** findings grouped into the **fixed 12-channel catalog** (§2.5): `hero_headline`, `business_description`, `services_copy`, `cta_contact`, `legal_footer`, `platform_consistency`, `hero_image`, `work_proof_images`, `team_image`, `image_fixes`, `optimized_site`, `promo_video`. Only rows with ≥1 finding or coverage gap appear (except pinned rows). `before_json` filled with the original excerpt/asset refs.
- **Files:** `lib/rubric.ts`.
- **Accept:** channel ids and titles match catalog exactly; each row links its finding_ids.

#### F-016 · Priority ranking + pinning — P0 · Owner C
- **Build:** `priority = impact² / effort` (impact/effort per finding from rubric engine, v1 math). `optimized_site` **always pinned first** and carries the primary Do It For You action; `promo_video` **always pinned last**, `status=coming_soon`, disabled.
- **Files:** `lib/rubric.ts`.
- **Accept:** ordering stable and deterministic for identical input.

#### F-017 · Cross-platform NAP consistency — P0 · Owner C
- **Build:** deterministic (no model): normalize brand name, phone, address across website / Maps / portals; any contradiction → `high` finding + `platform_consistency` channel row + `nap_consistent=false` in `presence_coverage`.
- **Files:** `lib/rubric.ts`.
- **Accept:** stop-ship: inconsistent name/phone/address surfaces as its own channel row.

#### F-018 · Rubric unit tests — P0 · Owner C
- **Build:** fixed sub-scores → **exact** totals (stop-ship acceptance); band boundaries; channel derivation + priority order snapshot; NAP normalizer cases.
- **Files:** `lib/rubric.test.ts` (or `tests/rubric.test.ts`).
- **Accept:** `pnpm test` green; test is the acceptance command for E1 merges.

---

## E2 · Evidence pipeline (no video, no ffmpeg — deleted from v2 scope)

#### F-020 · Website fetch + extract — P0 · Owner B
- **Build:** server-side `fetch`, 10 s timeout → `cheerio` → `WebsiteEvidence`: `{https, title, h1, meta_description, has_viewport_meta, tel_links[], visible_text (first ~8k chars, section-tagged hero/about/services/footer), nav_links[], has_impressum, has_datenschutz, img_candidates[{src, alt, natural_size?}]}`.
- **Files:** `lib/pipeline/website.ts`.
- **Accept:** real plumber site yields populated evidence incl. section tags + tel links.

#### F-021 · Tavily Extract fallback — P0 · Owner B · **partner must-use, never cut**
- **Build:** when direct fetch is blocked, empty, or a JS-only shell → Tavily Extract; evidence `source` tagged `tavily`.
- **Files:** `lib/pipeline/website.ts`, `lib/pipeline/tavily.ts`.
- **Accept:** a JS-shell test URL still produces scoreable text via Tavily.

#### F-022 · Unreachable-site path — P0 · Owner B
- **Build:** fetch AND Tavily both fail → criteria score from absence; finding: *"site unreachable — that is what your customer sees too."* Never a crash, never a fake result.
- **Files:** `lib/pipeline/website.ts`, `lib/rubric.ts`.
- **Accept:** dead URL produces a complete scored report with the unreachable finding.

#### F-023 · Portal evidence (Gelbe Seiten / Check24 / other) — P0 · Owner B
- **Build:** every portal URL through the same fetch → cheerio → Tavily-fallback path into source-tagged blocks `{platform, url, visible_text, brand_name?, phone?, address?}`. Three uses: (1) more customer-visible words for the text lane (thin portal copy = real finding with quote), (2) NAP input for F-017, (3) platform-coverage chip. **Read-only — never post/modify portals.**
- **Files:** `lib/pipeline/website.ts` (shared extractor), `lib/schemas.ts`.
- **Accept:** a Gelbe-Seiten URL contributes quoted text findings tagged with its platform.

#### F-024 · Google Maps input handling — P0 · Owner B
- **Build:** Maps URL accepted in its own field; P0 = Tavily search on the place name for corroborating public data + prompt user for GBP screenshots. **No official Places API.**
- **Files:** `lib/pipeline/gbp.ts`, `lib/pipeline/tavily.ts`.
- **Accept:** Maps-only input still produces findability + reputation context.

#### F-025 · GBP screenshot extraction + precedence — P0 · Owner B
- **Build:** GPT-4o vision extracts fields (review count, rating, photo reviews, description) from uploaded GBP screenshots; extracted fields shown as **editable pre-fills**; precedence **manual > screenshot > link** (v1 §5.2 method).
- **Files:** `lib/pipeline/gbp.ts`.
- **Accept:** screenshot upload → chips populated; manual edit overrides.

#### F-026 · Image harvest + normalize — P0 · Owner B
- **Build:** from `img_candidates`: filter icons/logos (<200 px, svg, sprite paths), dedupe, download the **8 largest content images** → `storage/images/<auditId>/`, `sharp` normalize (1024 px long edge, JPEG q80). Harvested + manual uploads = the scored image set.
- **Files:** `lib/pipeline/images.ts`.
- **Accept:** real site yields ≤8 normalized JPEGs on disk with `assets` rows.
- **Kill line (T+90):** tracer not through → drop harvesting to uploads-only.

#### F-027 · Manual attachments ingestion — P0 · Owner B
- **Build:** pasted text (`pasted_text`) ingested as scoreable text evidence (source `manual`); uploaded images (≤10) normalized into the scored set (kind `uploaded_image`).
- **Files:** `lib/pipeline/images.ts`, orchestrator wiring.
- **Accept:** audit with only pasted text + 2 uploads (no links) scores end-to-end.

#### F-028 · Tavily findability check — P0 · Owner B · **runs in every LIVE audit, never cut**
- **Build:** live search `"{trade} {city}"` → status `found | portals_only | not_found | error` + actual result list `{title,url}[]`, `source: "tavily"`. Feeds landing pitch + Copy Strategist T4. Runtime error → **honest error state**, derived judgments labeled `ASSUMPTION`. Venue outage: integration + README stay, REPLAY shows the recorded call.
- **Files:** `lib/pipeline/tavily.ts`.
- **Accept:** stop-ship: findability chip with expandable real results in every LIVE audit.

#### F-029 · Zero-usable-images path — P0 · Owner B
- **Build:** no harvestable/uploaded images → that is itself the **top image finding**; image lane scores from absence; `hero_image`/`work_proof_images`/`team_image` rows generated.
- **Files:** `lib/pipeline/images.ts`, `lib/rubric.ts`.
- **Accept:** text-only audit still renders a full report with image-gap channels.

---

## E3 · Expert agents (GPT-4o structured calls)

#### F-030 · Structured-call helper — P0 · Owner C
- **Build:** `openai.ts`: zod schema → Structured Outputs call, **1 retry**, models from env, error surfaced honestly (never silently swallowed).
- **Files:** `lib/agents/openai.ts`.
- **Accept:** malformed model output → one retry → typed result or explicit failure.

#### F-031 · Prompt library — P0 · Owner C
- **Build:** Appendix B prompts verbatim as the base: Copy Strategist, Visual Director, Synthesizer, Rewriter (per text channel), gpt-image-1 trade-preset templates. Doctors preset: compliance instruction (no healing promises / superlatives — DE Heilmittelwerbegesetz sensitivity, flagged not lawyered).
- **Files:** `lib/agents/prompts.ts`.
- **Accept:** prompts reviewed once at T2:30 (image templates) — noted in tracker.

#### F-032 · Copy Strategist agent — P0 · Owner C
- **Build:** one structured call: input = ALL extracted text evidence (website sections + portal blocks + pasted text + GBP description, source-tagged) → T1–T8 `Criterion[]` (sub-scores + quoted evidence) + findings quoting **exact sentences** (or naming the exact absence). Doctor businesses: healing promises / superlatives flagged under T7.
- **Files:** `lib/agents/experts.ts`.
- **Accept:** stop-ship: every text finding quotes actual source-tagged sentences.

#### F-033 · Visual Director agent — P0 · Owner C
- **Build:** GPT-4o vision batches over the normalized image set → I1–I6 per image (concrete failure naming, e.g. "blurry boiler close-up, no human, no outcome") + coverage gaps (hero/team/work-proof/branding) + hard red flags.
- **Files:** `lib/agents/experts.ts`, batching in `lib/pipeline/images.ts`.
- **Accept:** stop-ship: image findings reference the actual harvested photo (thumbnail).

#### F-034 · Synthesizer agent — P0 · Owner C
- **Build:** one structured call after the rubric engine: executive summary + one-line channel verdicts (plain words, concrete problem) + the single Cognee comparison line **only** when memories provided. **May NOT change any number or ranking** — enforced structurally (numbers come only from `rubric.ts`).
- **Files:** `lib/agents/experts.ts`.
- **Accept:** diffing report numbers before/after synthesis shows zero changes.

---

## E4 · API + orchestration

#### F-040 · POST /api/audits (create) — P0 · Owner B
- **Build:** body per §5.4 `{brand_name, background?, trade, city?, presence:{website?, maps?, yellow_pages?, other?[]}, pasted_text?, gbp_manual?}`; validation: **at least one presence link OR pasted text OR uploaded asset**; persist `business_json`, status `draft` → `201 {auditId}`.
- **Files:** `app/api/audits/route.ts`.
- **Accept:** invalid body → 4xx with message; valid → row in `audits`.

#### F-041 · POST /api/audits/:id/assets — P0 · Owner B
- **Build:** multipart upload (images ≤10, GBP screenshots); stores file to `storage/`, creates `assets` row (`uploaded_image` | `gbp_screenshot`) → `201 {assetId}`.
- **Files:** `app/api/audits/[id]/assets/route.ts`.
- **Accept:** uploaded file lands on disk + DB, later enters the scored set.

#### F-042 · POST /api/audits/:id/analyze — P0 · Owner B
- **Build:** returns `202` immediately; kicks the async pipeline; status → `analyzing`; progress via polling.
- **Files:** `app/api/audits/[id]/analyze/route.ts`.
- **Accept:** call returns <1 s; progress_events start appearing.

#### F-043 · Analyze orchestrator (5 stages) — P0 · Owner B
- **Build:** per §5.5: **Stage 1 Evidence (parallel)**: all presence links fetched+extracted (each with Tavily fallback) · image harvest+normalize · pasted text · deterministic NAP comparison · Tavily findability · GBP screenshots (if given) · Cognee findSimilarAudits (P1, 10 s, silent-skip). **Stage 2 Experts (2 parallel calls)**: Copy Strategist ∥ Visual Director. **Stage 3 Rubric Engine (pure TS)**. **Stage 4 Synthesizer** (may not change numbers). **Stage 5 persist** → status `scored`, fire-and-forget `addAuditMemory`. Progress steps exactly: `reading_site → collecting_images → checking_local_search → recalling_similar_audits → experts_scoring → building_channels → done`. Failure → status `failed` with honest error. Latency target ≈30–50 s.
- **Files:** `lib/pipeline/orchestrator.ts`.
- **Accept:** schedule exit test T1:30: one real plumber site scored end-to-end.

#### F-044 · GET /api/audits/:id (status/report) — P0 · Owner B
- **Build:** `{status, progress[], report?, channels?, preview_ready}` — the polling endpoint (1 s cadence from the client).
- **Files:** `app/api/audits/[id]/route.ts`.
- **Accept:** shape validates against frozen schemas; drives the analyzing checklist.

#### F-045 · POST /api/audits/:id/improve — P0 · Owner B (route) + C (engine)
- **Build:** body `{channels: string[] | "all"}` → `202`; per-channel status `todo → improving → improved`; when `all` completes, `preview_json` assembled and status → `complete`. Both page buttons (Improve It / Do It For You) call this one endpoint.
- **Files:** `app/api/audits/[id]/improve/route.ts`.
- **Accept:** single-channel and `"all"` both work; states visible via F-044 polling.

#### F-046 · GET /api/audits (history) — P0 · Owner B
- **Build:** list history rows (id, created_at, brand, score, status, mode) for `/history`.
- **Files:** `app/api/audits/route.ts`.
- **Accept:** rows persist across restart (SQLite stop-ship).

---

## E5 · "Do It For You" engine (the wow)

#### F-050 · Text channel rewrites — P0 · Owner C
- **Build:** one GPT-4o structured call per text channel, **parallel ≤5**; input = finding evidence + extracted original text + trade preset + city + tone rules ("plain words, no marketing jargon, local, trustworthy — write like a good craftsman talks"); doctors preset adds compliance. Output per channel: `{channel_id, before_excerpt, after:{channel-specific fields}, rationale_one_liner}`. Channel-specific afters per §2.5 catalog: `hero_headline` → new H1 + subline + CTA text · `business_description` → about paragraph + GBP description ≤750 chars DE+EN · `services_copy` → per-service rewrite with local keywords · `cta_contact` → CTA copy + contact block text · `legal_footer` → checklist + footer template · `platform_consistency` → corrected NAP block for all platforms.
- **Files:** `lib/improve/text.ts`.
- **Accept:** schedule exit test T2:30: Improve It on `hero_headline` → real before/after inline.

#### F-051 · Image generation (gpt-image-1) — P0 · Owner C
- **Build:** model `gpt-image-1`; sizes `1536x1024` (hero) / `1024x1024` (others); quality `medium` (~10–20 s each); **cap 3 generated images per audit** (hero + 2; P1 raises to 5); prompt templates per trade preset (e.g. plumber hero per §4.3), "no text, no logos".
- **Files:** `lib/improve/image.ts`.
- **Accept:** generated files in `storage/generated/`, `assets` rows kind `generated_image`.
- **Kill line (T+165):** generation unstable → channels improve with shot briefs + best real photos.

#### F-052 · Truth labeling + shot briefs — P0 · Owner C · **truth rule, non-negotiable**
- **Build:** every generated asset stored with `label='ai_concept'`; UI + preview render a visible corner badge **`AI concept`**; each image channel also delivers the **shot brief** for replacing it with a real photo (e.g. 10-shot list for `work_proof_images`). Generated images are never presented as the business's real work. P1 edits labeled `enhanced`.
- **Files:** `lib/improve/image.ts`, badge in `components/primitives/Badge`.
- **Accept:** stop-ship: every generated image carries the `AI concept` badge everywhere it renders.

#### F-053 · Generation failure ladder — P0 · Owner C
- **Build:** image generation fails → channel **still flips to improved** with shot brief + best-existing-image recommendation; preview falls back to the best real harvested image. Failures never faked.
- **Files:** `lib/improve/image.ts`, `lib/improve/preview.ts`.
- **Accept:** simulated API failure still completes Do It For You end-to-end.

#### F-054 · Preview assembly — P0 · Owner C · **the preview is never cut**
- **Build:** `preview.ts` assembles `preview_json` from all improved channels into the **fixed one-page template**: nav + hero (new H1/subline/CTA + hero image) → trust bar (years/certs/review chip) → services (3 cards) → work-proof gallery → about/team → contact block (tel CTA) → legal footer. Also produces the accurate "what changed" list ("headline rewritten · 3 images upgraded · CTA added · Impressum added"). Degrade path: text-only After if images unavailable.
- **Files:** `lib/improve/preview.ts`.
- **Accept:** stop-ship: preview renders assembled page; "what changed" list is accurate.

#### F-055 · Improve orchestration — P0 · Owner C
- **Build:** text channels ∥ image channels (text parallel ≤5; images cap 3), then preview assembly; per-channel DB status flips `improving → improved`; `"all"` completion → `preview_json` + audit status `complete`. Latency target ≈45–75 s, covered by staged progress: `rewriting_text → generating_images → assembling_preview → done`.
- **Files:** `lib/improve/*`, orchestrator wiring, `lib/pipeline/orchestrator.ts`.
- **Accept:** schedule exit test T3:30: full Zero-to-Hero walkthrough on a real site.

---

## E6 · Frontend — the three-page product (Apple-style everywhere)

Design mandate: every page beautiful, every page simple. One idea per screen, generous
whitespace, restrained color, calm motion. Builders load the workspace `apple-design`
skill before implementing UI.

### Page 1 — Landing `/`

#### F-060 · Landing page — P0 · Owner A
- **Build:** full-bleed centered hero: eyebrow "Visibel", H1 **"From Zero to Hero."**, subline "Show us your business. See what customers see. Let us fix it.", one pill CTA → `/audit/new`. Below: three quiet feature cards (Score → Improve → Before/After) + a **sample-report link** that opens the REPLAY audit. **Nothing else.**
- **Files:** `app/page.tsx`.
- **Accept:** matches §6.2; sample link opens a fully rendered REPLAY recommendation page.

### Page 2 — Input `/audit/new`

#### F-061 · Section A — General information — P0 · Owner A
- **Build:** brand name (text) · background as trade/category **pills**: plumber / electrician / roofing / handyman / doctor / other · optional one-line description ("what do you do best?") · location (city, optional service radius). Apple-style grouped card on `#F5F5F7`, hairline dividers.
- **Files:** `app/audit/new/page.tsx`, `components/input/GeneralInfoSection.tsx`.

#### F-062 · Section B — Online presence — P0 · Owner A
- **Build:** one labeled URL field per surface: Business website · Google Maps · Yellow Pages (Gelbe Seiten) · Check24 / other platform pages with repeatable **"+ add another"**. Each field: small platform icon + URL validation.
- **Files:** `components/input/PresenceSection.tsx`.

#### F-063 · Section C — Attachments — P0 · Owner A
- **Build:** manual text input (textarea: "paste your ad text, flyer text, or description") · image dropzone (**≤10**) · quiet disclosure slot for GBP screenshots.
- **Files:** `components/input/AttachmentsSection.tsx`.

#### F-064 · Input validation + submit flow — P0 · Owner A
- **Build:** validation: **at least one presence link OR one attachment**; empty fields are allowed and meaningful (a missing website is a finding, not an error). One sticky pill CTA **"Check my business"** → POST create → upload assets → POST analyze → route to `/audit/[id]`.
- **Files:** `app/audit/new/page.tsx`.
- **Accept:** empty-form submit blocked with calm message; valid submit lands on Page 3 analyzing state.

### Page 3 — Recommendation `/audit/[id]` — **THE demo page**

#### F-065 · Analyzing state — P0 · Owner A
- **Build:** calm progress checklist bound to the exact §5.5 step names via **1 s polling** of F-044 (P1: SSE). Transitions into the score header when `scored`.
- **Files:** `app/audit/[id]/page.tsx`, `components/report/AnalyzingChecklist.tsx`, `lib/client/poll.ts`.

#### F-066 · Score header — P0 · Owner A
- **Build:** giant **animated count-up** overall number + band label + mode badge (LIVE / REPLAY SAMPLE); two lane cards (Text / Images) with criterion bars; fixed weights visible (the "scoring isn't arbitrary" pitch — every number click-traceable to a quote or photo).
- **Files:** `components/report/ScoreHeader.tsx`.
- **Accept:** schedule exit test T1:30: renders real numbers from a live audit.

#### F-067 · Context chips — P0 · Owner A
- **Build:** **findability chip** (Tavily): Found / Portals only / Not found — with the actual result list as expandable evidence, and an **honest error state** (judgments labeled `ASSUMPTION`) · **platform coverage chip**: which surfaces exist + NAP consistency verdict · **reputation chips** (only when Maps/GBP/manual data present): review count, rating, photo-review presence — context only, **not** scored.
- **Files:** `components/report/ContextChips.tsx`.

#### F-068 · Evidence highlights — P0 · Owner A
- **Build:** worst quotes (source-tagged) + worst images (thumbnails), tappable to expand.
- **Files:** `components/report/EvidenceHighlights.tsx`.

#### F-069 · Action strip — P0 · Owner A
- **Build:** "**N things stand between you and Hero.**" + the primary pill **Do It For You** (framed as the purchased service: "You approve. We do the work."). Calls improve with `"all"`.
- **Files:** `components/report/ActionStrip.tsx`.

#### F-070 · Channel list rows — P0 · Owner A
- **Build:** one row per channel: left = icon, title, one-line verdict, severity dot, mini before-excerpt; right = **`Improve It`** pill. Row states: `todo` (blue) → `improving` (spinner) → `improved` (green check, button becomes "View result", inline before→after reveal expands).
- **Files:** `components/report/ChannelRow.tsx`, `ChannelList.tsx`.
- **Accept:** schedule exit test T1:30–2:30: rows render from live channel data with working states.

#### F-071 · Pinned rows — P0 · Owner A
- **Build:** `optimized_site` pinned **top** as full-width row whose button is **Do It For You** · `promo_video` pinned **bottom**, grayed, "**Coming soon**" + roadmap tooltip (the only remnant of video — do not build more).
- **Files:** `components/report/ChannelList.tsx`.

#### F-072 · Inline improved reveals — P0 · Owner A
- **Build:** text channels reveal rewritten copy inline (before → after); image channels reveal generated images **beside the originals**, each badged `AI concept`, with the shot brief visible.
- **Files:** `components/report/BeforeAfterInline.tsx`.

#### F-073 · "Your new page is ready" bar — P0 · Owner A
- **Build:** when `optimized_site` completes: sticky bar appears → opens the Before/After overlay (`/audit/[id]/preview`).
- **Files:** `app/audit/[id]/page.tsx`.

### Before/After preview `/audit/[id]/preview`

#### F-074 · Preview overlay page — P0 · Owner A · **never cut**
- **Build:** full-screen overlay of the recommendation page (product stays a three-page story), server-rendered from `preview_json`: the assembled Apple-style one-pager (sections per F-054). Header "**{Business} — from Zero to Hero.**"; close returns to the channel list. Static demonstration artifact — **no fake deploy button**; pitch: "publish this for me" is the paid next step.
- **Files:** `app/audit/[id]/preview/page.tsx`, `components/preview/*`.

#### F-075 · Before panel (as-is) — P0 · Owner A
- **Build:** structured "as-is" panel assembled from extracted original text + harvested images — honest facsimile labeled "**what customers see today**". (P1 replaces with pixel-true screenshot, F-095.)
- **Files:** `components/preview/BeforePanel.tsx`.

#### F-076 · Split view + what-changed chips — P0 · Owner A
- **Build:** side-by-side split with **draggable divider** (desktop demo default) + Before/After **toggle**; floating chip listing what changed (from F-054's accurate list).
- **Files:** `components/preview/SplitView.tsx`.
- **Accept:** stop-ship: renders assembled page, all AI images badged, change list accurate.

### Utility + polish

#### F-077 · History page `/history` — P0 · Owner A
- **Build:** quiet table proving persistence (not part of the 3-page story): date, business, score, status, link back to report.
- **Files:** `app/history/page.tsx`.

#### F-078 · LIVE/REPLAY badges everywhere — P0 · Owner A
- **Build:** truthful mode badge on score header, preview, history rows; REPLAY shows `REPLAY SAMPLE`. A failed live call is **never** silently replaced by fixture content.
- **Files:** `components/primitives/Badge.tsx` + wiring.

#### F-079 · Apple polish pass — P0 · Owner A · bounded, T3:30–4:15 only
- **Build:** single bounded pass over all pages: tokens audit, motion (fade+rise on scroll, score count-up, 200–300 ms ease-out), empty states, error states, `prefers-reduced-motion`. Do not let polish eat the schedule (risk §9).
- **Files:** all `app/**` + `components/**`.
- **Accept:** schedule exit test T4:15: demo-grade visuals.

---

## E7 · Execution modes & fixtures (truth discipline)

#### F-080 · LIVE/REPLAY mode switch — P0 · Owner C
- **Build:** `DEMO_MODE=replay` env or `?mode=replay` → load full fixture; `execution_mode` persisted per audit; LIVE badge on real runs. Failed live call → honest failure, never fixture-masked.
- **Files:** `lib/fixtures/`, mode check in orchestrator + pages.
- **Accept:** one keystroke away from a working demo with Wi-Fi off (risk §9).

#### F-081 · REPLAY fixture skeleton — P0 · Owner C · T0
- **Build:** `fixtures/replay-audit.json` skeleton validating against the frozen `Report` schema so pages render from hour 0 (frontend can build against it all day).
- **Files:** `lib/fixtures/replay-audit.json`.
- **Accept:** schedule exit test T0:30: fixture renders.

#### F-082 · Full REPLAY fixture from real run — P0 · Owner C+D · T4:15
- **Build:** re-record the fixture from a real completed audit of the sample plumber, **including the recorded Tavily result and pre-generated images** (files committed or stored for offline load).
- **Files:** `lib/fixtures/replay-audit.json`, fixture image assets.
- **Accept:** full walkthrough (score → improve → preview) works offline in REPLAY.

---

## E8 · Cognee memory (P1 — **must attempt**, deliberately simple, never faked)

#### F-090 · Cognee wrapper — P1 · Owner C
- **Build:** `memory/cognee.ts`: `addAuditMemory(audit)` after completion (summary: name, trade, city, scores, top finding titles) + `findSimilarAudits(trade, city)` at analyze start. **10 s timeouts, never throws**, absent key → auto-disabled (env flag). Non-blocking: failure = feature absent.
- **Files:** `lib/memory/cognee.ts`.
- **Accept:** with no key set, pipeline behavior is byte-identical; with key, calls fire.

#### F-091 · Memory line + chip — P1 · Owner C (synth) + A (chip)
- **Build:** ≥1 **real** retrieved audit → Synthesizer writes exactly one line ("Compared to N similar businesses we audited, the weakest shared area is {lane}") + a "memory: Cognee" chip. Failure/absence → nothing renders, nothing blocks. Stop-ship: line renders **only** from a real retrieved audit.
- **Files:** `lib/agents/experts.ts`, `components/report/ContextChips.tsx`.
- **Kill line (T+225):** Cognee unstable → keep wrapped calls behind env flag, demo without the line — never fake it.

#### F-092 · Seed audits for demo recall — P1 · Owner D
- **Build:** run 2–3 audits during rehearsal so demo-time recall is real.
- **Accept:** demo audit shows the memory line from genuinely stored prior audits.

---

## E9 · Other P1 bonuses (only after all P0 green)

#### F-095 · Real Before screenshot — P1 · Owner B
- **Build:** pixel-true "Before" via **local Playwright** capture, replacing the as-is panel in the preview.
- **Files:** `lib/pipeline/screenshot.ts`, `components/preview/BeforePanel.tsx`.

#### F-096 · Real-photo enhancement — P1 · Owner C
- **Build:** `images.edit` (gpt-image-1) on the business's best real photo (relight/recrop), labeled **`enhanced`**; raises generation cap to 5; wired into `image_fixes` channel.
- **Files:** `lib/improve/image.ts`.

#### F-097 · SSE streaming progress — P1 · Owner B
- **Build:** replace 1 s polling with SSE for analyze + improve progress.
- **Files:** `app/api/audits/[id]/route.ts` (or events route), `lib/client/poll.ts`.

---

## E10 · Demo, docs & submission (Owner D — the floater lane)

#### F-100 · Test-target set — P0 · Owner D · **before T0**
- **Build:** pick 2–3 real weak websites (local plumber, repair service, doctor's practice); pre-verify they are fetchable (risk §9); capture fixture material.
- **Accept:** URLs listed in team notes; each fetch-tested.

#### F-101 · Product README — P0 · Owner D
- **Build:** in `code/media-ad-coach/README.md`: setup, architecture, **partner usage** (OpenAI; Tavily documented as load-bearing; Cognee documented truthfully as deliberately simple light-touch memory), boilerplate boundary, explicit "**video analysis/generation not implemented**" statement. No secrets.
- **Accept:** stop-ship checklist item; judge can run the project from README alone.

#### F-102 · Rehearsals ×3 — P0 · Owner D
- **Build:** three full run-throughs against the fixed checkpoint, incl. one with Wi-Fi off (REPLAY drill) and fallback timing. Never first-run live on stage.
- **Accept:** schedule exit test T5:00: demo survives Wi-Fi loss.

#### F-103 · 2-minute video — P0 · Owner D
- **Build:** 2-minute demo video with live walkthrough of key features (submission requirement, `FACT`).
- **Accept:** ≤2:00, shows Landing → Input → Score → Do It For You → Before/After.

#### F-104 · Submission — P0 · Owner D
- **Build:** public GitHub repo (product repo pushed) + video submitted **before 19:00**. Feature freeze at T+255 — reliability only after that.
- **Accept:** submission receipt before deadline.

---

## P2 backlog (only if everything is green — do not start otherwise)

- **F-110** · Cognee deeper usage — P2 · C
- **F-111** · PDF export of the report — P2 · C
- **F-112** · Multi-page preview (services subpage) — P2 · A

## Explicitly NOT building (v2 removals — do not build, do not fake)

- Video **analysis** (ffmpeg / Whisper / yt-dlp pipeline) — deleted entirely.
- Video **generation** — exists only as the disabled `promo_video` "Coming soon" row (F-071).
- Activity/frequency and review-reputation **pillars as scored components** — review count/rating are context chips only (F-067), never in the score.
- Account scraping · CTR/revenue prediction · login · payments · deployment (localhost only).
