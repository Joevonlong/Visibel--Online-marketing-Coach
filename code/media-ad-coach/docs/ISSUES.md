# Issue registry — Visibel

> **Anonymization note (2026-07-22):** live reproduction evidence in this
> registry was gathered against real Berlin businesses. For publication, every
> business name, phone number, URL, and quoted site text has been replaced
> with fictional stand-ins ("Muster + Sohn GmbH", "Rohrfuchs",
> `*.example` domains). The defects, root causes, and fixes are unchanged.

Single source of truth for every defect found in this product. **Process (mandatory):**

1. Any newly discovered problem is registered HERE first (ID, status, description) — before any fix is written.
2. Every fix records its concrete method and touched files on the issue, so a later revert is detectable and re-fixable from this file alone.
3. Statuses: `OPEN` → `IN_PROGRESS` → `FIXED` (code landed, unit-tested) → `VERIFIED` (proven in a real end-to-end run). `DEFERRED` = consciously not fixed now, with rationale.
4. **One issue = one branch.** Cut `fix/iss-<id>-<slug>` from main, fix and verify on the branch, merge back to main resolving all conflicts before starting the next issue. Concurrent fixes each branch independently from main.

| ID | Title | Status | Owner |
|----|-------|--------|-------|
| ISS-001 | Harvested/uploaded images stored with absolute paths → "Image unavailable" | VERIFIED | main session |
| ISS-002 | DEMO_MODE=replay silently replays the plumber fixture for any user-submitted website | VERIFIED | main session |
| ISS-003 | Scraper reads only the input URL homepage — misses phone/email/Impressum/photos on subpages | VERIFIED | agent evidence-crawl |
| ISS-004 | Copy Strategist never sees machine-detected contact/legal signals → false "no phone / no Impressum" findings | VERIFIED | agent evidence-crawl |
| ISS-005 | Findability search uses English trade terms → US results for German businesses | VERIFIED | agent evidence-crawl |
| ISS-006 | "Do It For You" image stage runs serially → 3.5-minute spinner | VERIFIED | agent improve-engine |
| ISS-007 | No timeout on OpenAI image calls → a stuck call spins forever | FIXED | agent improve-engine |
| ISS-008 | Generated images ignore the real business (canned per-trade prompts, real photos unused) | VERIFIED | agent improve-engine |
| ISS-009 | Bare Google Maps link contributes no GBP data (no Places/live corroboration) | DEFERRED (superseded by FEA-101) | — |
| ISS-010 | cta_contact one-liner still says "no phone number" although the phone was found on a subpage | VERIFIED | main session |
| ISS-011 | Hero edit treats a tiny logo as the "best real photo" — output labeled `enhanced` from a 50×50 source | VERIFIED | main session |
| ISS-012 | JS-rendered (SPA) sites yield null website evidence — scored as "absent" with no disclosure, rendered DOM unused | FIXED | main session |
| ISS-013 | Synthesizer conflates local-search "not found" with "website not found" | VERIFIED | main session |
| ISS-014 | "Original" photos are favicon-scale logos; real photos on the business website are never scraped | VERIFIED | agent backend-integrator |
| ISS-015 | Hydration mismatch warning on <html> from extension-injected attribute | FIXED | agent frontend-builder |
| ISS-016 | Image-generation prompts are canned/plumber-biased — other trades still get plumber imagery | FIXED | agent backend-integrator |
| ISS-017 | After-page composition mixes in low-value old photos instead of new-or-important-only | FIXED | agent backend-integrator |
| ISS-018 | After-page curation reason never renders — frontend reads `selection_reason`, backend writes `after_curation` | FIXED | agent frontend-builder |
| ISS-019 | Enhanced text-bearing photo renders garbled signage; same source shown twice with two treatments | FIXED | agent backend-integrator |
| ISS-020 | "Credentials & real work" admits novelty/marketing images (dog-in-pipe stock, price-list screenshot) | FIXED | agent backend-integrator |
| ISS-021 | /audit/sample served a stale pre-fix REPLAY audit — demo showed pre-ISS-019/020 output | VERIFIED | main session |
| ISS-022 | PDF report download returns 503 — Playwright browser binary missing after a version bump | VERIFIED | agent backend-integrator |
| ISS-023 | Raw Playwright exception rendered in the report "Your site today" card — overflows the card and leaks local paths | VERIFIED | agent frontend-builder |
| ISS-024 | GBP listing card asserts "MISSING" for unverified fields (hardcoded hours, null→false photo collapse, tel-only phone) | VERIFIED | agent frontend-builder |
| ISS-026 | Before/After split view: left "what customers see today" pane leads with raw extracted text instead of the site's real visual | VERIFIED | agent frontend-builder |
| ISS-029 | After page renders a harvested original as if it were the generated result — no badge, no note, identical to the Before side | VERIFIED | agent frontend-builder |
| ISS-030 | Raw image-generation / image-edit provider errors interpolated straight into the report UI | VERIFIED | agent frontend-builder |
| ISS-032 | Report/preview stop updating at status "complete", so FEA-112 images only appear after a manual reload | VERIFIED | agent frontend-builder |
| ISS-033 | A deliberately skipped image renders as an empty panel — a planning decision looks like a failure | VERIFIED | agent frontend-builder |
| ISS-037 | After-page cards break on long text — no render-side clamping, and grids sized by viewport instead of the pane | FIXED | agent frontend-builder |
| ISS-025 | Machine-extracted contact signals never persisted → plain-text phone reported as missing | FIXED | agent backend-integrator |
| ISS-027 | Every generated image times out at 120s — the configured image model is far slower than the budget | VERIFIED | agent backend-integrator |
| ISS-028 | Image-generation failures are swallowed by preview assembly — the After page cannot tell a generated image from a reused original | VERIFIED | agent backend-integrator |
| ISS-031 | An unrecognized provenance value invalidates the WHOLE PreviewJson parse (+ no test pinned that the ISS-028 fields survive a parse) | VERIFIED | agent backend-integrator |
| ISS-034 | Image classification misses uploaded assets and mislabels non-work content — a listing screenshot became the page hero | VERIFIED | agent backend-integrator |
| ISS-035 | The same picture fills several slots — an original, its AI-enhanced twin, and the hero were all one image | VERIFIED | agent backend-integrator |
| ISS-036 | Services card prints the raw scraped homepage, led by the internal "Business type:" prefix | VERIFIED | agent backend-integrator |
| ISS-038 | Gallery still showed 1 image — the run used a pre-FEA-117 build, and filler subjects came from scraped menu debris | VERIFIED | agent backend-integrator |
| ISS-039 | Generated images come back as COLLAGES — one frame holding three unrelated scenes instead of one photograph | VERIFIED | agent backend-integrator |
| ISS-040 | The one-click "Do It All For You" button never fills the gallery — it posts an array, and only the literal "all" counted as a full run | VERIFIED | agent backend-integrator |
| ISS-041 | A plumber's "storefront" image is an anonymous residential front door — the premises prompt has no trade content | VERIFIED | agent backend-integrator |

---

## ISS-001 — Harvested/uploaded images stored with absolute paths

- **Status:** VERIFIED — 2026-07-20 E2E audit `c5bc1c41`: relative paths in DB, `/assets/...` serves 200, report page renders both real site photos (screenshot evidence); legacy absolute-path rows also serve 200 via assetUrl remap.
- **Found:** 2026-07-20, DB inspection of audit `22116d02` (muster-sanitaer.example). 2 real site photos WERE harvested but every report card showed "Image unavailable".
- **Root cause:** `lib/pipeline/images.ts` wrote `assets.storage_path` as an ABSOLUTE filesystem path (`/Users/.../storage/images/<id>/img-1.jpg`). `lib/client/assets.ts#assetUrl` passes any `/`-prefixed path through verbatim as a URL, and `app/assets/[...path]/route.ts` only serves storage-root-relative paths → guaranteed 404. Generated images (relative paths) worked; harvested/uploaded ones never did. `lib/pipeline/screenshot.ts` already used the correct relative convention — `images.ts` was the outlier.
- **Fix method:**
  - `lib/pipeline/images.ts`: `harvestImages` and `ingestUploadedImage` now store `images/<auditId>/<file>` (relative); `prepareImagesForVision` resolves via new `resolveAssetFilePath` (absolute OR relative, so legacy rows still load for vision).
  - `lib/client/assets.ts#assetUrl`: legacy absolute paths containing `/storage/` are remapped to `/assets/<rest>` so pre-fix DB rows display again.
- **Regression guard:** `tests/api.test.ts`, `tests/pipeline.test.ts`, `tests/client.test.ts` green. `tests/orchestrator.test.ts` "normalizes a raw uploaded_image row..." now asserts the normalized `storage_path` is NOT absolute and resolves it against the storage root before `existsSync` (updated 2026-07-20 as part of this fix). If this ever reverts, symptom is "Image unavailable" on Photos-to-improve cards while `storage/images/<auditId>/` contains files.

## ISS-002 — DEMO_MODE=replay silently replays the fixture for user-submitted websites

- **Status:** VERIFIED — 2026-07-20 E2E audit `0eb4b865` (example-demo.onrender.com): LIVE mode, real score, zero plumber-fixture leakage (Rohrfuchs/plumber/Sanitär/Heizung/ROST all absent from the report).
- **Found:** 2026-07-20, DB inspection: audits for `example-demo.onrender.com` (2026-07-18 17:05–17:14) were created `execution_mode=REPLAY` → the recorded Rohrfuchs plumber fixture was shown for a completely different website. This is the reported "any site still shows the plumber" bug.
- **Root cause:** `app/api/audits/route.ts` computed `executionMode = mode==="replay" || process.env.DEMO_MODE==="replay" ? "REPLAY" : "LIVE"` — a global env var silently overrode real user input.
- **Fix method:** REPLAY is now per-request opt-in ONLY (`mode:"replay"`, used by the sample-report page `app/audit/sample`). User submissions from `/audit/new` always run LIVE. Without API keys a LIVE run fails honestly (existing behavior, consistent with the truth-discipline rule).
- **Regression guard:** `tests/api.test.ts` — test renamed to "ignores DEMO_MODE=replay for a user-submitted audit — REPLAY is per-request opt-in only" and asserts LIVE.

## ISS-003 — Scraper reads only the homepage

- **Status:** VERIFIED — 2026-07-20 E2E audits `63f224cf`/`c5bc1c41` (muster-sanitaer.example): phone "030 / 123 456 78" (Kontakt subpage), full address (Impressum subpage), and subpage quotes appear in the report.
- **Found:** 2026-07-20, evidence_json of audit `22116d02`: muster-sanitaer.example yielded 526 chars, `tel_links: []`, `nav_links: []`, 2 img_candidates — phone, email, Impressum content, and most photos live on subpages (Kontakt/Impressum/Leistungen). `nav_links` was empty because extraction only read `<a>` inside `<nav>`, which old sites don't use.
- **Fix method:** `lib/pipeline/website.ts` — `nav_links` (schema field name unchanged) is now populated by new `collectSameDomainLinks`/`extractSameDomainLinksFromCheerio`, which walks EVERY `<a href>` (not just `<nav> a`), resolves it absolute, keeps same-registrable-host only, drops `#`/fragment/`mailto:`/`tel:`/`javascript:`, dedupes, caps at 40. `fetchWebsiteEvidence` then runs a bounded crawl: new `selectPriorityLinks` picks up to 5 links matching kontakt/contact/impressum/datenschutz/leistungen/angebot/ueber/über/about/unternehmen/service/team/referenzen; `crawlPrioritySubpages` fetches them in parallel (reuses `tryFetchHtml`'s existing 10s timeout, silently skips failures); new `mergeSubpageEvidence` folds each subpage's tel_links (union), img_candidates (dedup by normalized URL), has_impressum/has_datenschutz (OR-merge), and visible text (joined per subpage, re-tagged into ONE frozen `WebsiteTextSection` via new `classifySubpageSection` — footer for kontakt/impressum/datenschutz, services for leistungen/angebot/service, about otherwise) into the homepage `WebsiteEvidence`. `VISIBLE_TEXT_CAP` raised 8k→12k; each subpage capped at 2k chars so one page can't crowd out the others. New `collectEmailsFromHtml` (mailto: hrefs + a conservative regex over script/style-stripped body text) runs on the homepage and every subpage inside `extractWebsiteEvidenceFromHtml` itself, folding any found address into a real `{section:"footer"}` visible_text block ("Contact email(s) found on site: ...") — `lib/schemas.ts` (frozen) was never touched; emails ride the existing text field instead of a new one. New `extractContactSignals(evidence)` re-derives deduped phones (tel_links + PHONE_PATTERN over visible_text) and emails (EMAIL_PATTERN over visible_text) out of band for ISS-004 to consume.
- **Touched files:** `lib/pipeline/website.ts`, `tests/pipeline.test.ts`.
- **Regression guard:** `tests/pipeline.test.ts` — new `describe` blocks for `collectSameDomainLinks` (all-anchors + cross-domain/fragment/mailto/tel/javascript exclusion + cap 40), `selectPriorityLinks` (keyword match + order + cap), `classifySubpageSection` (footer/services/about), `collectEmailsFromHtml` (mailto + text regex + script exclusion + dedup), `extractWebsiteEvidenceFromHtml` email-footer embedding, `mergeSubpageEvidence` (tel union, img dedup, legal-flag OR-merge, per-page section re-tagging, 2000-char per-subpage cap, no-op on empty subpage list), and `extractContactSignals`.

## ISS-004 — Experts never see machine-detected contact/legal signals

- **Status:** VERIFIED — 2026-07-20 E2E: T8 evidence is now literally "Impressum page: present. Datenschutz page: present." (score 5/5, was a false "absent" finding).
- **Found:** Same audit: `has_impressum: true` was correctly detected, yet the report quotes the model saying "No Impressum or Datenschutz appears anywhere in the provided text" — the Copy Strategist only receives raw visible text, never the extracted booleans/tel links, so it contradicts the pipeline's own evidence.
- **Fix method:** `lib/pipeline/orchestrator.ts#buildTextEvidence` now takes a `realPhotoCount` argument (the LIVE branch passes `harvestResult.assets.length` — the actual downloaded/normalized image count, not raw candidates) and, when website evidence exists, prepends one `TextEvidenceItem` (`source: "fetched"`, `label: "site signals (machine-extracted)"`) built by new `buildSiteSignalsText` from `website.ts#extractContactSignals`: "Phone numbers found: ... . Email addresses found: ... . Impressum page: present/absent. Datenschutz page: present/absent. Real photos found on site: N." — capped to 400 chars.
- **Touched files:** `lib/pipeline/orchestrator.ts`, `tests/orchestrator.test.ts`.
- **Regression guard:** `tests/orchestrator.test.ts` — "prepends a machine-extracted 'site signals' item so the model can't contradict the pipeline's own detected phone/legal signals (ISS-004)" asserts the item is first in `textEvidence`, `source: "fetched"`, contains the known phone number and "Impressum page: present"/"Datenschutz page: present", and stays under 400 chars.

## ISS-005 — Findability search queries in English

- **Status:** VERIFIED — 2026-07-20 E2E: findability results are German (Gelbe Seiten, sanitaer-heinze.com, …), no more "Berlin, NJ" US hits.
- **Found:** evidence_json findability results for a Berlin plumber were "Berlin Plumbers – Riley Plumbing" (Berlin, NJ, USA) — `checkFindability` built an English query ("plumber Berlin").
- **Fix method:** `lib/pipeline/tavily.ts#checkFindability` — new `germanTradeTerm`/`GERMAN_TRADE_TERMS` maps `plumber→"Sanitär Heizung"`, `electrician→"Elektriker"`, `roofing→"Dachdecker"`, `handyman→"Hausmeisterservice"`, `doctor→"Arzt Praxis"` (unmapped trades, e.g. `other`, fall through to the raw trade string). The primary search query is now `"{German term} {city} {brand name}"` in one call (previously `"{trade} {city}"` with no brand name at all); the empty-results fallback drops the city but keeps the term + brand name. Function signature, `TavilyFindability` return shape, and the never-throws `status:"error"` contract are all unchanged.
- **Touched files:** `lib/pipeline/tavily.ts`.
- **Regression guard:** existing `tests/pipeline.test.ts` `classifyFindability` tests still pass unmodified (pure classifier, untouched); no network-dependent test was added for the live query string per the packet's no-network-test constraint — `tsc --noEmit` + full suite confirm the signature/contract is unchanged.

## ISS-006 — Serial image generation makes "Do It For You" take minutes

- **Status:** VERIFIED — 2026-07-20 E2E: improve completed in 68s and 61s (generating_images stage 58s) vs 3m27s before — measured from progress_events.
- **Found:** progress_events of audit `22116d02`: `generating_images` 20:10:15 → `assembling_preview` 20:13:42 = 3m27s. `runLiveImprove` awaits 3 concept generations + 1 edit one-by-one.
- **Fix method:** `lib/improve/orchestrate.ts#runLiveImprove` — the `generating_images` stage now fires every image-channel call (up to 3 `generateChannelImage` + `enhanceBestExistingImage` for `image_fixes`) as concurrent async tasks and `await Promise.allSettled(...)`s them; each channel flips to `"improving"` up front and independently to `"improved"` as its own result settles (each task also has a defensive try/catch so one unexpected throw can't take the rest down, on top of image.ts's existing never-throw contract). Progress-step order and F-053 failure honesty are unchanged. Added `OPENAI_IMAGE_QUALITY` (low|medium|high, default medium) as a speed knob, read once in `lib/improve/image.ts#getImageQuality`.
- **Touched files:** `lib/improve/orchestrate.ts`, `lib/improve/image.ts`.
- **Regression guard:** `tests/improve.test.ts` — "ISS-006: parallelizes the generating_images stage — total elapsed is well under the serial sum" (4 fake 100ms calls complete in <350ms, not 400ms+).

## ISS-007 — No timeout on OpenAI image calls

- **Status:** FIXED — verified by unit tests only (`tests/improve.test.ts` timeout path); a genuine provider hang cannot be induced in a live E2E run.
- **Found:** Code inspection (`lib/improve/image.ts`): `images.generate`/`images.edit` have no timeout — one stuck HTTP call leaves the audit "improving" and the button spinning forever.
- **Fix method:** `lib/improve/image.ts` — every `images.generate`/`images.edit` call now passes the OpenAI SDK's own per-request `{ timeout }` option (aborts the real HTTP request) AND is raced via a new `withImageTimeout` helper against a `setTimeout` (makes the timeout observable even against a fake/injected client with no real transport, e.g. in tests). Default 120000ms, override via env `OPENAI_IMAGE_TIMEOUT_MS` (read fresh per call via `getImageTimeoutMs`). A timeout surfaces as the normal honest `generation_error`/`edit_error` string ("... timed out after Nms") — never a hang, never a thrown exception out of the improve engine.
- **Touched files:** `lib/improve/image.ts`.
- **Regression guard:** `tests/improve.test.ts` — "ISS-007: a stuck images.generate call times out honestly instead of hanging" (unit) and "ISS-007: a stuck image call times out honestly and the whole run still completes (never hangs)" (full `runImprove` via orchestrate.ts).

## ISS-008 — Generated images ignore the real business and its real photos

- **Status:** VERIFIED — 2026-07-20 E2E: prompts carry "MUSTER + SOHN GmbH in Berlin"; audit `63f224cf` hero used images.edit on the real best asset (label enhanced, source_asset_id); after ISS-011 the tiny-logo case falls back honestly.
- **Found:** `IMAGE_GEN_TEMPLATES` are fixed per-trade texts; brand/city/services and harvested photos are never used → outputs look "random", and the product promise ("optimize the photos the business already has") is not delivered.
- **Fix method:** `lib/agents/prompts.ts` — new `buildImageGenPrompt(trade, variant, business?)` appends an optional grounding suffix ("The business is {brand_name}, a local {trade} in {city}. {background}. Do not render any text, signage, or logos...") to the frozen base templates, only including fields that actually exist; new `buildHeroEditPrompt(trade, business?)` for the edit-mode hero instruction. `lib/improve/image.ts#generateChannelImage` — for `hero_image` specifically, first calls new `attemptHeroEdit`, which PREFERS `images.edit` on `pickBestExistingAsset`'s best real harvested/uploaded photo (size 1536x1024, `label: "enhanced"`, `meta_json.source_asset_id`) when one is readable and the shared `GENERATED_IMAGE_CAP` (5) isn't already hit; a missing source or a failed edit falls back to the existing concept-generation path (`label: "ai_concept"`, `generation_error` stays `null` — an edit failure that falls back to a successful generate is NOT a channel failure) with the fallback reason honestly recorded in the resulting asset's `meta_json.hero_edit_fallback_reason`. `team_image`/`work_proof_images` stay concept generation but now also receive the business-aware grounded prompt. Cap accounting unchanged: `enhanced` counts toward `GENERATED_IMAGE_CAP` but never `CONCEPT_IMAGE_CAP`. `orchestrate.ts` passes `{brand_name, city, background}` from `BusinessInput` through to `generateChannelImage`.
- **Touched files:** `lib/agents/prompts.ts`, `lib/improve/image.ts`, `lib/improve/orchestrate.ts`.
- **Regression guard:** `tests/improve.test.ts` — "hero_image prefers editing...", "hero_image falls back to concept generation... when no usable real photo exists", "an edit failure on hero_image falls back to a successful concept generation, honestly...", "concept prompts are grounded in the real brand name and city when provided" (all prefixed `ISS-008:`).

## ISS-009 — Bare Google Maps link contributes no GBP data

- **Status:** DEFERRED
- **Description:** `lib/pipeline/gbp.ts` is by design P0 "no Places API": a Maps URL alone adds no fields; GBP evidence only comes from manual fields or an uploaded screenshot. A user pasting only a Maps link gets no Maps-derived insight.
- **Why deferred:** needs a product decision (Places API key / scraping legality / Tavily corroboration cost). ISS-005's brand+city findability fix partially compensates. Revisit after the current fix wave is VERIFIED.
- **Update 2026-07-21 — superseded, entry kept for history:** the product decision was made
  (Playwright read of the public listing, no Places API, no new billing/credential) and
  shipped as **FEA-101** (`lib/pipeline/gbp-live.ts`, VERIFIED). A pasted Maps link now
  contributes real `phone`, `rating`, `opening_hours_text`, `has_listing_photos` and, when
  Google serves the full panel, `review_snippets`; failures degrade into a structured
  `live_error`. Status stays DEFERRED rather than VERIFIED because this entry described the
  P0 design gap, not a fix of its own — see `docs/FEATURES.md` FEA-101 for the evidence.

## ISS-010 — cta_contact one-liner claims "no phone number" despite the phone being found

- **Status:** VERIFIED — 2026-07-20 E2E audit `c5bc1c41`: cta_contact one-liner now reads "contact details are hard to find in dense text" — no false absence claim.
- **Found:** 2026-07-20 E2E verification run (audit `63f224cf`, muster-sanitaer.example LIVE): T5 evidence correctly quotes "Telefon:030 / 123 456 78" (found on the Kontakt subpage via the new crawl), but the synthesized `cta_contact` one-liner still reads "No phone number, opening hours, contact form, or clear way to get in touch is shown." The model conflates "hard to find on the homepage" with "missing".
- **Fix method:** `lib/agents/prompts.ts` — `COPY_STRATEGIST_SYSTEM` now instructs the model to check the "site signals (machine-extracted)" item before claiming any absence ("present but hard to find", never "missing", unless signals also report none); `SYNTHESIZER_SYSTEM` mirrors the rule for one-liners ("hard to find", never "missing/none shown" when the finding says the detail exists but is buried).
- **Touched files:** `lib/agents/prompts.ts`.
- **Regression guard:** prompt-level behavior (model wording) — verified by rerunning a LIVE audit; no deterministic unit test possible without a model call. If regressed, symptom: a channel one-liner claims "no phone/Impressum" while T5/T8 evidence quotes them.
- **Severity:** minor (report wording truthfulness), does not block the flow.

## ISS-011 — Hero edit uses a tiny logo as its "best real photo" source

- **Status:** VERIFIED — 2026-07-20 E2E audit `c5bc1c41` improve run: hero fell back to ai_concept with meta reason "no usable real photo — …small logos/icons…"; image_fixes skipped with the honest edit_error instead of enhancing a logo.
- **Found:** 2026-07-20 E2E verification run (audit `63f224cf`): the site's only real images are a 50×50 logo and a 270×31 banner. `attemptHeroEdit` picked the 50×50 logo as the edit source, so the output is labeled `enhanced` (implying "derived from a real photo") while being visually almost entirely generated from a logo.
- **Fix method:** `lib/improve/image.ts` — new exported `isUsablePhotoSource(asset)` (short edge ≥ `MIN_EDIT_SOURCE_SHORT_EDGE` = 300px from meta_json width/height; permissive when dimensions unknown); `resolveEditableSource` now returns a discriminated result (`ok` / `none` / `too_small`); hero edit path maps `too_small` to a fallback to concept generation (`label: "ai_concept"`) with `meta_json.hero_edit_fallback_reason` mentioning "small logos/icons"; `enhanceBestExistingImage` returns an honest `edit_error` skip ("retake real photos instead") instead of editing a logo.
- **Touched files:** `lib/improve/image.ts`, `tests/improve.test.ts`.
- **Regression guard:** `tests/improve.test.ts` — three `ISS-011:` tests (hero refuses tiny logo → ai_concept + fallback reason; enhance skips with honest edit_error; `isUsablePhotoSource` dimension gating incl. unknown-permissive).
- **Severity:** medium (truth-label integrity).

## ISS-012 — JS-rendered (SPA) sites yield null website evidence, scored without disclosure

- **Status:** FIXED (branch `fix/iss-012-spa-rendered-evidence`)
- **Found:** 2026-07-20, initially attributed to audit `0eb4b865` (example-demo.onrender.com). CORRECTION (same day): that attribution was a tooling misread — the API response has no `evidence` key, and the DB shows the site WAS read (1,436 chars, source "fetched"). The defect class itself was real in code: a fetch-thin + Tavily-empty site ended `null` with zero disclosure, and the Playwright pass discarded its rendered DOM. Kept FIXED on the strength of the unit tests; no live SPA reproduction was observed.
- **Fix method:**
  - `lib/pipeline/screenshot.ts`: the ok-result now carries transient `rendered_html` (`page.content()`, failure-tolerant — a content() error never sinks a good screenshot).
  - `lib/pipeline/orchestrator.ts`: when a website URL was provided and the fetch/Tavily ladder produced null-or-thin evidence but `rendered_html` exists, run `extractWebsiteEvidenceFromHtml` on the rendered DOM (source stays `"fetched"` — it IS the site's real content); `rendered_html` is stripped before `before_screenshot` is persisted. When website evidence is STILL null, a report disclaimer states the site could not be read — "missing evidence, not verified absence".
- **Touched files:** `lib/pipeline/screenshot.ts`, `lib/pipeline/orchestrator.ts`, `tests/orchestrator.test.ts`.
- **Regression guard:** `tests/orchestrator.test.ts` — two `ISS-012:` tests (rendered-DOM fallback populates website evidence incl. tel/impressum and never persists rendered_html; unreadable site produces the explicit disclaimer).
- **Bounded scope:** subpage crawl remains fetch-only; the rendered-DOM fallback covers the entry page.

## ISS-013 — Synthesizer conflates local-search "not found" with "website not found"

- **Status:** VERIFIED — 2026-07-20 E2E audit `c5bc1c41`: summary/one-liners no longer claim the website was "not found"; findability phrased as listing discoverability.
- **Found:** 2026-07-20 E2E verification (audit `c5bc1c41`, muster-sanitaer.example LIVE): findability.status="not_found" (the BUSINESS LISTING was not found in local search) but the executive summary and the optimized_site one-liner read "The website was not found in the audit" — factually wrong, the website exists and was fully read (64/100 text score from its own content).
- **Fix method:** `lib/agents/prompts.ts` `SYNTHESIZER_SYSTEM` — explicit rule: findability is about the business LISTING in local search, never the website; with website evidence present, never call the website "missing"/"not found" (phrase as "hard to find in local search").
- **Touched files:** `lib/agents/prompts.ts`.
- **Regression guard:** prompt-level (model wording) — verified by rerunning a LIVE audit; symptom on regression: executive summary claims the website was not found while text criteria quote its content.
- **Severity:** minor (report wording truthfulness).

## ISS-014 — "Original" photos are favicon-scale logos; real site photos never scraped

- **Status:** VERIFIED — 2026-07-20 LIVE E2E audit `ef37ba2d` (muster-sanitaer.example): the
  8 harvested "Original" photos are all REAL project photos from the site's
  Bildergalerie (`resources/A1.jpg`, `A2.jpg`, `C4-C8.jpg`, `D1-D2.jpg`, 120×120 each),
  every one recording `meta_json.source_page = https://www.muster-sanitaer.example/bildergalerie.html`.
  Neither favicon-scale logo (`BuF.jpg` 50×50, `BBuO.jpg` 170×19) appears in the
  harvested set — both are gated out by their true downloaded dimensions.
- **Found:** 2026-07-20 human review of the muster-sanitaer.example audit. The report's "Photos to
  improve" and the Before/After "Our work" grid showed two favicon-scale logo images
  presented as the business's ORIGINAL photos; the real website photos never appeared.
- **Provenance answer (the human's question — where did the two logos come from?):** DB +
  storage inspection of the primary checkout's muster-sanitaer.example audits (e.g. `63f224cf`,
  `c5bc1c41`) shows the two assets are the ONLY two `<img>` tags on the muster-sanitaer.example
  **homepage (entry page)**: `https://www.muster-sanitaer.example/resources/BuF.jpg` (50×50, a small
  square logo) and `https://www.muster-sanitaer.example/resources/BBuO.jpg` (170×19, a
  supplier wordmark strip). Collection step: `website.ts`
  `extractWebsiteEvidenceFromHtml` scanned the homepage `<img>` tags → `img_candidates` →
  `images.ts` `harvestImages`. They became "Original" photos because (1) their filenames
  carry no `logo|icon|favicon|sprite|badge` hint, so `ICON_PATH_HINTS` missed them;
  (2) the homepage `<img>` tags declare no `width`/`height`, so the pre-download
  dimension gate never fired; and (3) the site's real work photos live on
  `bildergalerie.html`, which the ISS-003 subpage crawl never visited (its priority
  pattern targets kontakt/impressum/leistungen/referenzen, never a Bildergalerie). Net:
  homepage-only + two undeclared-size logo assets = the entire "Original" photo set.
- **Root cause (two parts, both confirmed):** (a) the subpage crawl was contact/legal/
  services-focused and never reached image-gallery/portfolio pages; (b) the logo/icon
  filter keyed only on filename hints and DECLARED dimensions, so a logo that declared no
  size and had a neutral filename passed straight through and was stored as a real photo.
- **Fix method:**
  - `lib/pipeline/website.ts`: new `IMAGE_GALLERY_LINK_PATTERN` + exported
    `selectImageGalleryLinks` (Bildergalerie/Galerie/Gallery/Referenzen/Projekte/
    Portfolio/Fotos/Bilder/...); `crawlPrioritySubpages` now fetches the deduped UNION of
    the ISS-003 text-priority links (≤5) and the gallery links (≤3), so real work photos
    and contact/legal text never starve each other. The `<img>` scan was factored into a
    shared `collectImgCandidates`; new exported `extractImgCandidatesFromHtml`. Per-image
    provenance is carried out of band as an `ImageSourceMap` (normalized src → source page
    URL, homepage-wins on dedup): `fetchWebsiteEvidence` now returns
    `{ evidence, imageSources }` (new `WebsiteEvidenceResult`), and
    `imageSourcesForSinglePage` covers the ISS-012 rendered-DOM entry-page path.
  - `lib/pipeline/images.ts`: new exported pure gate `isLogoScaleImage(w,h)` — favicon/
    logo-scale = short edge < 100px, or an extreme aspect ratio (≥4:1) on a still-modest
    (<300px short edge) image (catches the 170×19 wordmark). `harvestImages` applies it
    against each survivor's TRUE downloaded (sharp) dimensions and DROPS logo-scale
    assets (counted in `skipped_count`) so they are never stored as a harvested_image and
    can never surface as an "Original" photo. The pre-download declared-size gate in
    `filterImageCandidates` was lowered from 200px to the same 100px short-edge floor, so
    a real small gallery thumbnail (e.g. muster-sanitaer's 120×120) survives while a declared
    favicon is still dropped early. Each stored asset records `meta_json.source_page` from
    the provenance map (falls back to `baseUrl`). `lib/schemas.ts` was NOT touched —
    `source_page` rides the free-form `meta_json`.
  - `lib/pipeline/orchestrator.ts`: threads `imageSources` from `fetchWebsiteEvidence`
    (and the ISS-012 rendered-DOM branch) into `harvestImages`. The report's scored image
    set and the Before/After "Our work" grid read the existing harvested_image assets, so
    truthful real photos now flow into those surfaces with no UI change (FEA-103 owns UI).
- **Touched files:** `lib/pipeline/website.ts`, `lib/pipeline/images.ts`,
  `lib/pipeline/orchestrator.ts`, `tests/pipeline.test.ts`, `tests/images.test.ts`,
  `tests/orchestrator.test.ts`.
- **Regression guard:** `tests/pipeline.test.ts` — `isLogoScaleImage` (50×50 & 170×19
  flagged, 120×120 & real photos kept, wide-banner via aspect ratio, unknown-dims not
  gated); `filterImageCandidates` keeps a 120px thumbnail and drops a declared
  favicon-strip; `selectImageGalleryLinks` (keyword/order/cap); `extractImgCandidatesFromHtml`
  + `imageSourcesForSinglePage` provenance. `tests/images.test.ts` — `harvestImages` drops
  a logo-scale download by its true dimensions (undeclared-size, neutral filename — the
  exact muster-sanitaer logo case) while keeping a real photo and recording its `source_page`,
  plus the baseUrl fallback. If reverted, symptom: harvested_image set contains
  sub-100px logos and/or has no `source_page`, and gallery-page photos are absent.
- **Acceptance:** met — see Status (LIVE audit `ef37ba2d`). Spend: 1 LIVE audit; the
  "Do It For You" improve run was intentionally skipped (the report + Before/After
  surfaces read the harvested_image set proven above).
- **Linked:** ISS-008, ISS-011, ISS-012.
- **Severity:** high (judge-visible truthfulness of "real photo" claims).

## ISS-015 — Hydration mismatch warning on `<html>` from extension-injected attribute

- **Status:** FIXED (2026-07-21, branch `fix/iss-015-hydration-suppress`) — verify by loading
  `/audit/<id>` with Immersive Translate active and confirming no hydration warning.
- **Found:** 2026-07-21 human dev-console report on `/audit/<id>`: React hydration
  mismatch — server HTML lacks `data-immersive-translate-page-theme="light"` which the
  Immersive Translate browser extension injects on `<html>` before hydration
  (`app/layout.tsx:16`). Next.js 15.5.20.
- **Root cause:** third-party extension mutates the root element pre-hydration; React
  correctly flags the attribute delta. Not a data/logic bug, but it spams the console and
  can mask real hydration errors.
- **Required fix:** `suppressHydrationWarning` on the `<html>` element in
  `app/layout.tsx` (standard Next.js remedy for extension-injected root attributes;
  suppression is attribute-level, one element deep — real child mismatches still warn).
- **Acceptance:** no hydration warning with the extension active; no other layout change.
- **Owned paths:** `app/layout.tsx` (serialized — frontend lane).
- **Severity:** minor (console noise / DX).
- **Fix method:** added `suppressHydrationWarning` to the `<html>` element in
  `app/layout.tsx` (attribute-level, one element deep — child mismatches still warn). No
  other change. Gates green — `tsc --noEmit`, `pnpm test`, `pnpm build`.
- **Regression guard:** if reverted, the console hydration warning returns with the
  extension active; the `suppressHydrationWarning` prop on `<html>` in `app/layout.tsx` is
  the guard.

## ISS-016 — Image-generation prompts are canned/plumber-biased — other trades still get plumber imagery

- **Status:** FIXED (branch `fix/iss-016-dynamic-image-prompts`) — unit-tested; no LIVE
  improve run (prompt-level tests remove the doubt; spend cap respected).
- **Found:** 2026-07-21 human testing: a non-plumbing business still yielded plumber-style
  generated images.
- **Root cause (exact code path):** `lib/agents/prompts.ts#buildImageGenPrompt` always used
  `IMAGE_GEN_TEMPLATES[trade][variant]` as the DOMINANT base and merely appended a short
  grounding suffix. For `trade="other"` — which FEA-104 makes the COMMON path by funneling
  every custom/free-text business type there — the `other` base template was itself
  tradesperson-flavored ("friendly local **service professional in branded workwear** at
  work in a German home or storefront"). That trades imagery visually dominated the
  appended brand/background sentence, so a café/boutique rendered as a plumber-ish
  tradesperson. There was no literal cross-trade default in the lookup; the leakage was the
  canned `other` template's own vocabulary.
- **Refinement (2026-07-21, human):** the bar is SERVICE-LEVEL and ad-grade, not just
  "right trade". Prompts must enumerate the business's ACTUAL services (declared types +
  background AND scraped website evidence), read like a commercial ad brief (concrete
  setting, composition, lighting, mood), anchor a DISTINCT service per shot so a multi-image
  set covers different aspects (not N variants of one scene), and pass an anti-monotony bar
  (two businesses in the same category must not read interchangeably). The fix below was
  upgraded from the first "trade-neutral for `other`" pass to a unified service-level
  composer for ALL trades.
- **Fix method (final):**
  - `lib/agents/prompts.ts` — new `parseServices(text)` (exported, pure) enumerates concrete
    service phrases from free text / an offerings blob (splits on `,;/·•|`, `and/und/sowie/
    oder/or`; strips list leaders like "Wir bieten:" and trailing "seit 1998" tenure;
    dedupes; caps 6). New `composeServiceLevelPrompt` builds EVERY trade's prompt as a
    commercial ad brief: a per-shot ad-grade direction scaffold (`VARIANT_DIRECTION` — prime
    lens / depth of field / window light / composition / mood, trade-NEUTRAL wording),
    anchored to a DISTINCT real service — hero foregrounds the headline service in progress,
    work_proof a beautifully finished result of a SECOND service, team the people — plus the
    full enumerated offering for grounding and an explicit "never a generic {descriptor}
    scene, never another trade's work" guard, closing with `AD_GRADE_TAIL` (+ "no text, no
    logos") and the `Do not render any text, signage, or logos` instruction. `buildImageGenPrompt`
    now routes ALL trades through this composer; a truly context-free business falls back to
    the neutral per-trade `IMAGE_GEN_TEMPLATES` (still trade-neutral for `other`). Known
    trades keep correct imagery (plumber → plumber) with brand/city grounding intact
    (ISS-008 preserved). `ImageGroundingContext` gained an optional `services: string[]`.
  - `lib/improve/orchestrate.ts` — new `deriveBusinessServices(auditId, business)` enumerates
    services from `background` AND the scraped website evidence (`evidence_json.website.
    visible_text` sections services/hero/about), passed into `businessContext.services` so
    generation is grounded in the business's real, named offerings. `lib/schemas.ts` untouched.
- **Touched files:** `lib/agents/prompts.ts`, `lib/improve/orchestrate.ts`, `tests/agents.test.ts`.
- **Regression guard:** `tests/agents.test.ts` — "buildImageGenPrompt — business-composed, no
  cross-trade leakage (ISS-016)" (café/retail/plumber own-context + ZERO plumbing terms in
  non-plumber prompts + neutral no-context fallback) AND "buildImageGenPrompt — service-level,
  ad-grade, distinct-service coverage (ISS-016)": a multi-service plumber's hero names
  `"bathtub installation"` in progress while work_proof names a DIFFERENT service
  (`"sink installation"`) as a finished result (distinct-service coverage); a café's
  scraped `services` drive `"latte art"`/`"fresh pastries"` with no plumbing; prompts carry
  commercial-photography direction (ad-grade); two different same-category businesses yield
  different prompts (anti-monotony); `parseServices` unit cases. Existing "every
  IMAGE_GEN_TEMPLATE mentions no text/no logos" + "covers all six trades" still pass; ISS-008
  "concept prompts grounded in brand/city" still passes. If reverted, symptom: prompts read
  category-level ("a plumber with a wrench"), a café gets tradesperson imagery, or a
  multi-image set repeats one generic scene.
- **Linked:** ISS-008, FEA-104.
- **Severity:** high (judge-visible wrong/monotone output for non-plumber and multi-service businesses).

## ISS-017 — After-page composition mixes in low-value old photos instead of new-or-important-only

- **Status:** FIXED (branch `fix/iss-017-after-photo-curation`) — unit-tested + REPLAY
  end-to-end proof (below); no LIVE improve run needed (composition is deterministic given
  the assets + vision scores). NB: registered on the frontend branch (commit `6612207`),
  not yet on main — carried here with the fix; Mission Control resolves the `docs/ISSUES.md`
  overlap on merge.
- **Found:** 2026-07-21 human review: the generated After page sometimes included old site
  images, and weak/blurry/low-value ones, degrading the "wow".
- **Root cause (exact code path):** `lib/improve/preview.ts#resolveGallery` appended EVERY
  `harvested_image`/`uploaded_image` asset to the After gallery indiscriminately (its final
  `for (const asset of assets) ... addRef(asset.id)` loop), regardless of quality or scale.
  In REPLAY the After gallery came from the fixture's baked `preview_json.gallery`, which
  likewise listed four unscored original site photos.
- **Fix method (selection policy, backend):**
  - New `lib/improve/curate.ts#curateAfterOriginal(asset)` — the single deterministic policy.
    New-by-default: an original is admitted ONLY if it clears the ISS-014 photo-scale gate
    (`isLogoScaleImage` — never a logo/favicon/wordmark) AND is either a high-value real
    photo (summed I1-I6 vision score ≥ 18/30 AND short edge ≥ 400px) or a credential asset
    (certificate/license/award/Meister/Innung/TÜV/… matched from alt + src + source). Returns
    `{ include, group: "real_photo"|"credential"|null, reason }`. Weak, thumbnail-scale, or
    unscored originals are excluded with a reason.
  - `lib/improve/preview.ts#resolveGallery`: every ORIGINAL ref now passes through
    `curateAfterOriginal` before entering the gallery (generated concepts/enhanced images are
    always kept). The Before panel (`resolveBefore`) is untouched — "what customers see today"
    still shows every original honestly.
  - `lib/improve/curate.ts#recordAfterCuration(auditId)` persists each original's decision to
    `meta_json.after_curation` (idempotent), called from `orchestrate.ts` before live preview
    assembly, so the After-page UI (FEA-110) can label/group the survivors.
  - `lib/improve/curate.ts#filterGalleryByCuration` re-applies the policy to the REPLAY
    branch's baked gallery in `orchestrate.ts#runReplayImprove` (the baked preview predates
    this policy). It resolves baked refs by BOTH asset id and `meta_json.replay_fixture_asset_id`
    (replay seeds fresh ids that carry the fixture id), so the fixture's weak originals are
    correctly dropped. `lib/schemas.ts` untouched (`after_curation` rides `meta_json`).
- **Touched files:** `lib/improve/curate.ts` (new), `lib/improve/preview.ts`,
  `lib/improve/orchestrate.ts`, `tests/curate.test.ts` (new), `tests/improve.test.ts`,
  `tests/fixture.test.ts`.
- **Regression guard:** `tests/curate.test.ts` — `curateAfterOriginal` (high-value photo kept
  w/ reason+score; credential kept even if small/unscored; low-scored excluded; unscored
  excluded; scored thumbnail excluded as too-small; 50×50 logo and 800×120 banner excluded via
  ISS-014); `filterGalleryByCuration` (drops weak, keeps generated + high-value; resolves baked
  replay refs via `replay_fixture_asset_id`); `recordAfterCuration` persists reason to meta.
  `tests/improve.test.ts` — `assemblePreview` After gallery excludes a weak original, keeps a
  high-value original + AI concept, and the Before panel keeps every original.
  `tests/fixture.test.ts` — the full REPLAY walkthrough now asserts the After gallery is the
  generated-only curated set (no `label:null` originals). If reverted, symptom: weak/unscored
  original photos reappear in the After gallery.
- **Acceptance:** met. REPLAY E2E (analyze→improve all, no credentials): After gallery = 4
  generated images (3 AI concept + 1 enhanced), zero original site photos; the fixture's four
  unscored originals were dropped.
- **Linked:** ISS-014, ISS-011, FEA-110.
- **Severity:** medium (After-page quality/wow).

## ISS-018 — After-page curation reason never renders — meta key mismatch across lanes

- **Status:** FIXED (2026-07-21, branch `fix/iss-018-curation-meta-key`)
- **Found:** 2026-07-21 Mission Control integration check while merging the FEA-110
  (frontend) and ISS-017 (backend) branches: backend `recordAfterCuration` persists the
  decision at `meta_json.after_curation` = `{include, group, reason}`
  (`lib/improve/curate.ts`), but the preview page reads
  `meta.selection_reason ?? meta.keep_reason ?? meta.reason`
  (`app/audit/[id]/preview/page.tsx`) — so the FEA-110 "· <reason>" label can never
  appear for live-curated assets.
- **Required fix (frontend, two lines):** include `meta.after_curation.reason` (object,
  read defensively) at the FRONT of the fallback chain; optionally surface
  `after_curation.group` for the FEA-110 credentials block grouping. No backend change.
- **Acceptance:** with an asset whose `meta_json.after_curation.reason` is set, the
  preview page's AssetLookup `reason` carries it (unit-testable in the page's lookup
  helper or verified in replay once fixture assets carry the field); existing fallbacks
  intact.
- **Owned paths:** `app/audit/[id]/preview/page.tsx`.
- **Linked:** ISS-017, FEA-110.
- **Severity:** minor (label enrichment missing; layout unaffected).
- **Fix method:** new pure helper `lib/client/curationMeta.ts#extractCurationMeta` reads
  `meta_json.after_curation.reason` FIRST, then the legacy `selection_reason`/`keep_reason`/
  `reason` fallbacks, and also surfaces `after_curation.group` (`credential`/`real_photo`).
  `app/audit/[id]/preview/page.tsx` uses it to populate `AssetLookup.reason` + new
  `AssetLookup.group`. FEA-110 credentials block now labels `credential` assets "Certificate"
  (Award icon) vs "Real photo" (Camera icon) and appends "· <reason>" when present. No
  backend change; frozen `lib/schemas.ts` untouched.
- **Regression guard:** `tests/curationMeta.test.ts` (5 cases) — asserts after_curation.reason
  wins over the legacy keys, group is read/validated, legacy fallbacks still work, and
  missing/non-object meta degrades to nulls. If a lane renames the meta key again, these fail.
  Gates green — `tsc --noEmit`, `pnpm test`, `pnpm build`.

## ISS-019 — Enhanced text-bearing photo renders garbled signage; same source shown twice

- **Status:** FIXED (branch `fix/iss-019-enhance-text-dedupe`) — unit-tested + REPLAY repro.
  Verified deterministically: a fresh REPLAY analyze→improve now yields an After gallery of
  3 AI concepts only — the baked ENHANCED image (`f181b7a2`, edit source `779a434f` =
  `auto-start.png` slider graphic) is dropped, and no original appears twice.
- **Found:** 2026-07-21 design review round 1 (/audit/sample REPLAY): the "AI concept ·
  Enhanced" van photo in the After "Our work" gallery showed garbled gibberish text on the
  clipboard/signage, while the SAME source photo rendered just below as a clean "Real photo"
  in the Credentials block.
- **Root cause (confirmed by fixture inspection):** the fixture's `image_fixes` enhanced
  asset `f181b7a2` carries `meta.source_asset_id = 779a434f`, and `779a434f`
  (`auto-start.png`, a homepage slider graphic with text) is also the `best_existing`
  original. So the same source was presented BOTH as a garbled `images.edit` derivative
  (models garble text) AND raw. Two defects: (a) the enhance path had no text-heavy gate —
  `resolveEditableSource` only checked size (ISS-011), not text content; (b) composition had
  no one-source-one-treatment rule (`resolveGallery`/`filterGalleryByCuration` could emit an
  enhanced derivative and its raw source together).
- **Fix method:**
  - `lib/improve/curate.ts` — new `contentText(asset)` (joins Visual Director per-criterion
    `score_json` evidence + alt + src/source, lowercased) and `isTextHeavySource(asset)`
    (`TEXT_HEAVY_HINT`: text overlay / price list / preisliste / flyer / banner / slider /
    screenshot / signage / auto-start …), both pure/exported. New
    `applyOneSourceOneTreatment(gallery, byRef)`: (1) drops a baked ENHANCED whose edit
    source is text-heavy (garbled); (2) collects the source ids of KEPT enhanced images and
    drops any raw original that is one of them (resolving replay's fresh-id ↔ fixture-id via
    `replay_fixture_asset_id`), so a source is never shown twice. `filterGalleryByCuration`
    now runs curation THEN `applyOneSourceOneTreatment`; the shared `buildAssetRefMap` was
    factored out.
  - `lib/improve/preview.ts` — `resolveGallery` returns `applyOneSourceOneTreatment(entries,
    assetById)` so the LIVE gallery gets the same rule.
  - `lib/improve/image.ts` — `resolveEditableSource` adds a `text_heavy` result (after the
    ISS-011 `too_small` check); `attemptHeroEdit` falls back to concept generation (same as
    `too_small`), and `enhanceBestExistingImage` returns an honest skip
    (`edit_error` … "text-heavy graphic … image models garble … a fresh concept image is
    shown instead"). No text-bearing source is ever enhanced in a live run.
  - No `app/**` change needed: the view already renders originals from `preview.gallery`
    (AfterPanel splits by label), so filtering the gallery at composition is sufficient.
    `lib/schemas.ts` untouched.
- **Touched files:** `lib/improve/curate.ts`, `lib/improve/preview.ts`, `lib/improve/image.ts`,
  `tests/curate.test.ts`, `tests/improve.test.ts`, `tests/fixture.test.ts`.
- **Regression guard:** `tests/curate.test.ts` — `isTextHeavySource` (flyer/price-list/
  slider/screenshot/auto-start flagged; clean work photo passes); `applyOneSourceOneTreatment`
  (drops garbled enhanced with text-heavy source; dedupes a source shown enhanced+raw;
  resolves the raw via `replay_fixture_asset_id`). `tests/improve.test.ts` —
  `enhanceBestExistingImage` refuses a text-heavy source and reports it honestly (edit not
  called). `tests/fixture.test.ts` — the REPLAY walkthrough now asserts a 3-concept,
  no-enhanced, no-original After gallery. If reverted, symptom: a garbled enhanced reappears
  and/or a source shows both enhanced and raw.
- **Linked:** ISS-011, ISS-017.
- **Severity:** medium (fake-looking output undercuts truth discipline on the payoff page).

## ISS-020 — "Credentials & real work" admits novelty/marketing images

- **Status:** FIXED (branch `fix/iss-020-credentials-content-gate`) — unit-tested + REPLAY
  repro. A fresh REPLAY analyze→improve now renders the credentials block with only the two
  GENUINE work photos (`rohrfuchs-gasthermenwartung-berlin.jpg`, `trocknung-berlin.jpg`,
  each with a `real_photo` reason), and the dog stock shot + tablet screenshot + price-list/
  slider graphics are excluded with a recorded non-work reason; `after_curation` is present
  on every replay original.
- **Found:** 2026-07-21 design review round 1 (/audit/sample REPLAY): the credentials block
  included the dog-in-a-pipe novelty stock shot and a price-list screenshot.
- **Root cause — which of the two? BOTH, established by a deterministic replay repro:**
  (1) `after_curation` was **ABSENT** on the REPLAY path — ISS-017's `recordAfterCuration`
  ran only in the LIVE improve branch, never in `runReplayImprove`, so FEA-110/ISS-018 got
  no `group`/`reason` for any replay original. (2) The high-value gate had **no content
  check** — `curateAfterOriginal` keyed only on summed score + short-edge, so a well-scored,
  large non-work graphic (e.g. the 439×531 tablet screenshot) would be admitted as a real
  photo. On CURRENT main the fixture originals are unscored, so ISS-017's gate already
  excluded them (credentials empty) — i.e. the critic's dog/price-list sighting came from a
  STALE pre-ISS-017 replay audit; the latent gate-has-no-content-check defect is real and is
  what this fix closes.
- **Fix method:**
  - `lib/improve/curate.ts` — new `contentText(asset)` (Visual Director per-criterion
    `score_json` evidence + alt + src/source, lowercased) and `classifyContent(asset)` →
    `credential | non_work | work | unknown` (precedence: credential, then non-work, then
    work). `WORK_HINT` = genuine work/team/premises/vehicle vocab; `NON_WORK_HINT` = specific
    novelty/stock/marketing/screenshot/price-list phrases (deliberately NOT bare "text
    overlay"/"banner"/"slider" — a real photo's I5 evidence often says "no text overlay",
    which must not false-trigger). `curateAfterOriginal` now: credential→keep; non_work→
    EXCLUDE regardless of score/size; genuine `work` AND high-value (score ≥ 18/30, short
    edge ≥ 400)→keep as `real_photo`; else excluded (concrete size/score reason, then the
    generic "content not identifiable" note).
  - `lib/improve/orchestrate.ts` — `runReplayImprove` now calls `recordAfterCuration(auditId)`
    before assembling the (curated) baked preview, so replay originals carry
    `after_curation` for FEA-110.
  - `lib/fixtures/replay-audit.json` (demo data, so /audit/sample exercises the gate) —
    added realistic Visual Director `score` (with descriptive evidence) to the eight
    harvested originals: genuine work photos scored high with job-proof descriptions,
    novelty/marketing/screenshot graphics scored low with their true descriptions; and the
    baked `preview_json.gallery` now lists the genuine work photos as its label-null entries
    (plus the dog + tablet, which curation actively excludes — proving the gate). No
    `app/**` change; `lib/schemas.ts` untouched (`score`/`after_curation` use existing shapes).
- **Touched files:** `lib/improve/curate.ts`, `lib/improve/orchestrate.ts`,
  `lib/fixtures/replay-audit.json`, `tests/curate.test.ts`, `tests/fixture.test.ts`.
- **Regression guard:** `tests/curate.test.ts` — `classifyContent` (work/team/vehicle → work;
  dog/screenshot/price-list → non_work; "no text overlay" NOT a false non_work; credential
  precedence); `curateAfterOriginal` content gate (novelty excluded even when big+scored;
  genuine work kept as real_photo; unidentifiable content excluded); existing ISS-017 cases
  still green. `tests/fixture.test.ts` — the REPLAY walkthrough asserts the credentials block
  shows only harvested work photos and NEVER the novelty/screenshot refs. If reverted,
  symptom: a novelty/marketing/screenshot image reappears in the credentials block, or replay
  originals lose `after_curation`.
- **Linked:** ISS-017, ISS-018, FEA-110.
- **Severity:** medium (trust-purpose contradiction on the payoff page).

## ISS-021 — /audit/sample served a stale pre-fix REPLAY audit

- **Status:** VERIFIED — after the reseed, the only resumable REPLAY audit is
  `c96c218b` (created post-fix through the app's own API): gallery = 5 entries
  (3 AI concepts + 2 genuine work photos, no `enhanced` label), credentials show
  curation reasons; design-critic screenshots (`fresh-after-*`) confirm the rendered
  output. 13 LIVE audits untouched.
- **Found:** 2026-07-21 design review round 2: `app/audit/sample/page.tsx` reuses the
  OLDEST resumable REPLAY audit; the local DB still held ~21 REPLAY audits from
  2026-07-18 whose baked `preview_json.gallery` predated the ISS-019/020 fixes (8-item
  gallery incl. the garbled enhanced van and dog/price-list credentials). The demo
  entry point therefore displayed exactly the output round 1 flagged, although the
  pipeline code was fixed.
- **Fix method (data reseed, no code change):** deleted all stale REPLAY audits and
  their dependent rows (assets, channels, progress_events) from the local
  `storage/app.db`, keeping only post-fix `c96c218b-d29d-4205-b012-9e8c11c824c0`.
  REPLAY audits are deterministic and regenerable from the fixture at any time.
- **Deferred (with rationale):** a "regenerate sample" affordance on
  `app/audit/sample/page.tsx` (cache-invalidation by pipeline version) — the reuse
  policy can serve stale output again after future pipeline changes. Deferred: reseeding
  is a one-command local operation and the demo window is short; register a fresh issue
  if it recurs.
- **Owned paths:** local `storage/app.db` (data only).
- **Linked:** ISS-019, ISS-020.
- **Severity:** high for the demo (judge-visible), zero code impact.

## ISS-022 — PDF report download returns 503 (Playwright browser binary missing)

- **Status:** VERIFIED — 2026-07-21 real end-to-end download against a running app
  (`next dev`, port 3100): LIVE audit `362ca1c3` report page `200`, then
  `GET /api/audits/362ca1c3-.../report` → **HTTP 200**, `content-type: application/pdf`,
  `content-disposition: attachment; filename="Muster-GmbH-report.pdf"`, **172,016 bytes**,
  `file(1)` = "PDF document, version 1.4, 2 pages". REPLAY sample audit `c96c218b` →
  **HTTP 200**, **185,006 bytes**, 4-page PDF. `check-env` Playwright assertion passes,
  `tsc --noEmit` clean, `vitest run` 22 files / 352 tests green.
- **Found:** 2026-07-21, live testing of the report page: `GET /api/audits/<id>/report`
  responded `503 {"error":"PDF export is temporarily unavailable; the report remains
  available on screen."}` for every audit, so the judge-visible "Download PDF" action is
  dead.
- **Root cause (FACT):** `playwright` is pinned in `package.json` as `^1.61.1`; the
  installed 1.61.1 expects Chromium build **1228**, but the local browser cache
  (`~/Library/Caches/ms-playwright`) only held **1208** — the package was upgraded without
  re-running `playwright install`. `lib/export/report-pdf.ts:129`
  (`chromium.launch({ headless: true })`) therefore throws
  `Executable doesn't exist at .../chromium_headless_shell-1228/...`. That throw is caught
  by `app/api/audits/[id]/report/route.ts:40` and flattened into the generic 503; the only
  trace is a `console.warn` without the stack, which is why the real cause was invisible.
- **Collateral impact:** `lib/pipeline/screenshot.ts:126,162` launch Playwright the same
  way and silently degrade to `browser_unavailable`, so website screenshots were missing
  for the same reason without any operator-visible signal.
- **Severity:** high for the demo (judge-visible download + screenshot evidence).
- **Fix method:**
  - **Environment (the actual unblock):** `pnpm exec playwright install chromium` — downloads
    Chromium 149.0.7827.55 (playwright build 1228) plus the matching
    `chromium_headless_shell-1228` into `~/Library/Caches/ms-playwright`. Browser binaries
    live in the machine-local cache and are NOT committed.
  - **Recurrence prevention 1 — version pin:** `package.json` `playwright` changed from
    `^1.61.1` to the exact `1.61.1` (`pnpm-lock.yaml` specifier updated to match; resolved
    version unchanged), so an `install`/update can no longer silently move to a Playwright
    release whose browser build is absent from the cache.
  - **Recurrence prevention 2 — loud preflight:** `scripts/check-env.ts` (`pnpm check-env`)
    gained `checkPlaywrightBrowser()`: it dynamic-imports `playwright`, asserts
    `chromium.executablePath()` exists on disk, then performs a real
    `chromium.launch({ headless: true })` (20s timeout, immediately closed) because headless
    uses the separate `chromium_headless_shell-<rev>` build that a path check alone would
    miss. Any failure prints `… — run \`pnpm exec playwright install chromium\`` and makes
    `check-env` exit 1. The check runs before the key gate, so it works without API keys.
  - **Recurrence prevention 3 — honest logging:** `app/api/audits/[id]/report/route.ts`
    catch block now uses `console.error` with the full error object (stack included) instead
    of a message-only `console.warn`, and when the message matches
    `Executable doesn't exist` / `playwright install` it logs the install hint and adds a
    structured `reason: "browser_unavailable"` field to the 503 JSON. The user-facing `error`
    string is unchanged, so no frontend behavior changes.
- **Touched files:** `package.json`, `pnpm-lock.yaml`, `scripts/check-env.ts`,
  `app/api/audits/[id]/report/route.ts`, `docs/ISSUES.md`.
- **Regression guard:** `pnpm check-env` fails loudly (exit 1, explicit install command)
  whenever the Chromium build for the pinned Playwright version is missing — the same
  condition that silently produced the 503 and the `browser_unavailable` screenshot
  degradation. If this reverts, symptom: report download returns 503 with
  `reason:"browser_unavailable"` and the server log shows
  `Executable doesn't exist … chromium_headless_shell-<rev>`.
- **Out of scope (deliberate):** no refactor of `lib/pipeline/screenshot.ts`; it benefits
  from the same environment fix and preflight check without code change.

## ISS-023 — Raw Playwright exception rendered inside the report "Your site today" card

- **Status:** VERIFIED — 2026-07-21, production build served against a DB with an injected
  `before_screenshot` failure carrying the full raw Playwright banner: the report page and
  the Before/After preview render the designed placeholder, `document.scrollWidth ==
  clientWidth` at 1440 px AND 390 px (zero horizontal overflow), the served HTML contains
  0 occurrences of `Executable doesn't exist` / `npx playwright install` / any `/Users/`
  path, and the raw text appears only in the server log
  (`[report] before_screenshot unavailable: …`). Evidence:
  `docs/evidence/iss-023-screenshot-unavailable-card.png`,
  `docs/evidence/iss-023-preview-fallback.png`.
- **Found:** 2026-07-21, live report page (`/audit/<id>`), Website module. When the browser
  capture fails, the "YOUR SITE TODAY" card renders the raw exception text verbatim:
  `Website screenshot capture failed: browserType.launch: Executable doesn't exist at
  /Users/<user>/Library/Caches/ms-playwright/... ║ Looks like Playwright was just
  installed or updated. ║ npx playwright install ║ <3 Playwright Team ║`.
- **Symptoms:** (a) the long unbreakable path plus box-drawing characters overflow the
  rounded card horizontally and break the whole page layout; (b) an internal stack
  message — local filesystem paths and an install command — is shown to judges, which is
  neither professional nor a user-meaningful truth statement.
- **Root cause (FACT):** `lib/pipeline/screenshot.ts:199` stores the raw
  `error.message` in `evidence_json.before_screenshot.detail`;
  `app/audit/[id]/page.tsx#resolveBeforeScreenshot` and
  `app/audit/[id]/preview/page.tsx#resolveBeforeScreenshot` pass that string through
  unmodified, and `components/report/DiagnosticModules.tsx:124` (WebsiteBeforeCard) plus
  `components/preview/BeforePanel.tsx:73` render it as free text with no sanitization, no
  word-break and no container overflow constraint.
- **Severity:** high for the demo (judge-visible layout break + internal detail leak).
- **Owned paths:** `lib/client/screenshotStatus.ts`, `components/report/*`,
  `components/preview/BeforePanel.tsx`, `app/audit/[id]/page.tsx`,
  `app/audit/[id]/preview/page.tsx`.
- **Fix method:**
  - NEW `lib/client/screenshotStatus.ts` — the single boundary between machine error text
    and judge-visible copy. `screenshotFailureCopy(record)` picks from a fixed allowlist
    keyed by the machine-readable `reason` (`unsafe_url` / `playwright_unavailable` /
    `browser_unavailable` / `timeout` / `capture_failed` + generic fallback) and NEVER
    concatenates any part of `detail`. `screenshotFailureDiagnostics(record)` returns the
    raw string for the server log only. `safeUiText(value, max=180)` is the defensive
    net for ANY machine string: collapses control chars, box-drawing/CLI banner glyphs and
    whitespace to single spaces, then hard-truncates with an ellipsis.
  - `app/audit/[id]/page.tsx` + `app/audit/[id]/preview/page.tsx`: `resolveBeforeScreenshot`
    now returns allowlisted copy and `console.warn`s the raw detail server-side.
  - `components/report/DiagnosticModules.tsx`: the "Your site today" card renders a
    designed placeholder tile (lucide `ImageOff` in a round chip on `bg-surface-alt`,
    "Screenshot unavailable" + one neutral sentence) instead of the free-text detail;
    card gained `overflow-hidden`, copy gained `break-words`. Improve-API errors are run
    through `safeUiText` before entering state.
  - `components/preview/BeforePanel.tsx`: same placeholder treatment for the
    extracted-page fallback note.
  - `components/report/ChannelRow.tsx`, `components/report/ReportView.tsx` (poll error +
    "This audit failed" pipeline detail), `app/audit/new/page.tsx` (submit error): the same
    `safeUiText` + `overflow-hidden break-words` pattern — these were the other
    bare-error-string render sites on the report/audit surfaces.
- **Touched files:** `lib/client/screenshotStatus.ts` (new), `tests/screenshotStatus.test.ts`
  (new), `components/report/DiagnosticModules.tsx`, `components/report/ChannelRow.tsx`,
  `components/report/ReportView.tsx`, `components/preview/BeforePanel.tsx`,
  `app/audit/[id]/page.tsx`, `app/audit/[id]/preview/page.tsx`, `app/audit/new/page.tsx`.
- **Regression guard:** `tests/screenshotStatus.test.ts` feeds the exact real-world
  Playwright launch banner through both helpers and asserts the UI copy matches none of
  `/playwright|Executable|\/Users\/|npx |║|browserType/i`, stays ≤ 120 chars, and that
  `safeUiText` output carries no newline/box-drawing character and never exceeds 180 chars
  even for a 400-character unbreakable path. If the sanitizer is reverted, these fail.
  Full suite: 361 tests green; `tsc --noEmit` and `next build` clean.
- **Not changed on purpose:** `lib/pipeline/screenshot.ts` still stores the raw detail in
  evidence — that is correct diagnostic truth for the log/DB; only the UI boundary filters.
## ISS-025 — Machine-extracted contact signals are never persisted → a plain-text phone is reported as missing

- **Status:** FIXED — 2026-07-21, branch `fix/iss-025-persist-contact-signals`. Code landed and
  unit-proven: `tests/pipeline.test.ts` (pure `withContactSignals`) + `tests/orchestrator.test.ts`
  ("ISS-025: persists machine-extracted contact signals") asserts the field really lands in
  `audits.evidence_json` after a full LIVE `runAnalyzePipeline`. Gates green: `tsc --noEmit`,
  `vitest run` 22 files / 356 tests, `next build`.
- **Found:** 2026-07-21, root-cause investigation of the Muster + Sohn GmbH case
  (muster-sanitaer.example). The site publishes its phone number (030 12345678) as plain text, not as
  a `tel:` link, so `evidence.website.tel_links` is `[]` and every consumer that reads the
  persisted evidence concludes "no phone number on the website".
- **Root cause (FACT):** `lib/pipeline/website.ts:427-431` collects phone numbers ONLY from
  `a[href^="tel:"]`. The regex-based `extractContactSignals()`
  (`lib/pipeline/website.ts:591-610`) DOES recover plain-text phones and emails from
  `visible_text`, but its result is used exclusively to build the LLM prompt line
  (`lib/pipeline/orchestrator.ts:269`, `buildSiteSignalsText`) and is then thrown away — it
  never reaches `evidence_json`. So the model sees the phone while the persisted evidence
  (and anything rendering from it) does not.
- **Severity:** medium-high — judge-visible false negative ("missing phone") on a business
  that plainly shows its phone number.
- **Fix method:** persist the already-computed signals as NEW OPTIONAL fields on
  `WebsiteEvidence` and fill them once, at the single point where the analyze orchestrator
  finalizes website evidence, so every evidence path (direct fetch, subpage merge, Tavily
  fallback, rendered-DOM extraction) gets them for free.
  - **Field contract (frontend consumes this):** `evidence.website.contact_phones: string[]`
    and `evidence.website.contact_emails: string[]` — deduped, capped, `[]` when nothing was
    found (never absent on freshly written LIVE evidence, never fabricated).
  - `tel_links` stays exactly as it is (raw `tel:` hrefs); `contact_phones` is the superset
    (tel-derived + plain-text regex matches).
  - **Frozen-schema note:** `lib/schemas.ts` is marked FROZEN. This extension was approved by
    Mission Control on the human's instruction (2026-07-21) under the explicit constraint
    "additive optional fields only — no existing field changed or removed". Both new fields
    are `.optional()`, so every previously persisted evidence blob still parses.
- **Touched files:** `lib/schemas.ts`, `lib/pipeline/website.ts` (new exported pure
  `withContactSignals`), `lib/pipeline/orchestrator.ts` (stamps it onto the final website
  evidence before persistence), `tests/pipeline.test.ts`, `tests/orchestrator.test.ts`,
  `docs/ISSUES.md`.
- **Regression guard:** `tests/pipeline.test.ts` — a fixture page whose phone appears only as
  plain text (no `tel:` href) must yield `contact_phones` containing that number while
  `tel_links` stays empty. If this reverts, symptom: audits of sites without `tel:` links
  show "no phone number" findings although the number is on the page.

---

## ISS-024 — GBP listing card asserts "MISSING" for fields it never verified

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-024-gbp-truth-states`.
- **Verification (real end-to-end run):** dev server against REPLAY audit
  `c96c218b-d29d-4205-b012-9e8c11c824c0` — the GBP card renders "Opening hours not verified",
  "No phone number found", "Listing photos not verified" and "Customer photos in reviews not
  verified" as neutral NOT VERIFIED chips, and the single genuine absence ("Not on Google
  Maps", which the report itself establishes) as the only red MISSING chip. Before the fix
  the same audit showed a hardcoded "Opening hours not set / MISSING" plus a false
  "No photos on the listing". Gates green: `tsc --noEmit`, `vitest run` (397), `next build`.
  Field names confirmed against the landed FEA-101 backend (`lib/pipeline/gbp.ts:120-124`):
  `phone`, `opening_hours_text`, `has_listing_photos`, `review_snippets`, `live_source`.
- **Found:** 2026-07-21, report-page truth review of the "Google Business Profile & Maps"
  module (`GbpListingMock`).
- **Root cause (FACT), three separate defects in the same card:**
  1. `components/report/GbpListingMock.tsx:167-172` rendered the opening-hours row with a
     **hardcoded** `primary="Opening hours not set"` / `ok={false}`. No data path could ever
     change it — every audited business was told its hours are missing.
  2. `components/report/DiagnosticModules.tsx:193` computed
     `hasPhotos: report.reputation_chips?.has_photo_reviews === true`, collapsing `null`
     ("we could not verify") into `false` ("we verified it is absent"). It also mis-used the
     field: `has_photo_reviews` means "a review visibly contains a customer photo", not
     "the listing has photos".
  3. `app/audit/[id]/page.tsx:129-137` read the phone from `evidence.website.tel_links[0]`
     only, so a site printing its number as plain text showed "No phone number" (the
     rendering half of ISS-025).
- **Severity:** high — judge-visible false accusations against the audited business; the
  product's entire claim is that it reports what is really there.
- **Fix method:**
  - `InfoRow` in `GbpListingMock.tsx` goes from a two-state boolean to a **tri-state**
    `ok: boolean | null`: `true` → green check; `false` → red `MISSING` chip + advice;
    `null`/`undefined` → neutral gray `Not verified` chip + a "what to check" note. "We do
    not know" is never rendered as "you do not have it" again.
  - Opening hours are data-driven from `evidence.gbp.opening_hours_text` (FEA-101 live Maps
    field, consumed with optional chaining so it works before/after that lands); absent →
    the neutral state.
  - Listing photos read `evidence.gbp.has_listing_photos ?? null`; `has_photo_reviews` gets
    its own correctly-worded tri-state row ("Reviews include customer photos").
  - Phone prefers `evidence.website.contact_phones?.[0]` (ISS-025) and falls back to
    `tel_links[0]`; live `evidence.gbp.phone` wins over both when present.
  - Live-Maps provenance: when `evidence.gbp.live_source === "live_maps"` the card labels the
    data as coming from Google, and rows sourced from the website are marked as such, so the
    two origins are never conflated. Live review snippets render when present.
- **Touched files:** `components/report/GbpListingMock.tsx`,
  `components/report/DiagnosticModules.tsx`, `components/report/ReportView.tsx`,
  `app/audit/[id]/page.tsx`, `components/report/gbpTruthStates.ts` (new pure decision
  module — this repo's vitest setup is node-only, so the rule is extracted out of the .tsx
  to stay testable), `tests/gbpTruthStates.test.ts`, `docs/ISSUES.md`.
- **Regression guard:** `tests/gbpTruthStates.test.ts` — with an all-`null` GBP diagnostics
  object `deriveGbpRowStates` must return `null` (never `false`) for phone, opening hours,
  listing photos, photo reviews and rating; with `hasListingPhotos: false` exactly one row
  may be `false`. If this reverts, symptom: every report claims the business has no opening
  hours and no listing photos.

---

## ISS-026 — Before/After split view leads with extracted text, not the site's real visual

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-026-before-pane-real-visual`.
- **Verification (real end-to-end run):** dev server, `/audit/c96c218b…/preview` in Split
  mode — the left pane now leads with the framed "Screenshot unavailable" placeholder tile,
  followed by Weak spots and a collapsed "Show the text we read from your site" disclosure.
  No extracted text and no machine string renders above the fold, and nothing overflows the
  split container. Gates green: `tsc --noEmit`, `vitest run` (397), `next build`.
- **Found:** 2026-07-21, demo review of `/audit/<id>/preview` in Split mode.
- **Symptom:** when the LIVE browser capture is missing, the left pane
  ("WHAT CUSTOMERS SEE TODAY") drops straight into the text-extraction fallback: a wall of
  scraped section text becomes the main visual, headed by a capture-failure note. Before
  ISS-023 landed that note was the raw Playwright exception (local filesystem paths,
  `═║` box-drawing banner, `npx playwright install` instruction) rendered unwrapped, which
  also overflowed the pane. The half of the demo that is supposed to show the customer's
  real first impression showed machine diagnostics instead.
- **Root cause (FACT):** `components/preview/BeforePanel.tsx` had exactly two branches —
  screenshot, or the full extracted-text document. There was no designed "we could not
  capture this" state, so the fallback content carried the whole pane. ISS-023 sanitized the
  *string* (`safeUiText` + allowlisted copy from `lib/client/screenshotStatus`) but left the
  *layout* unchanged: extraction output still leads.
- **Severity:** high (judge-visible) — this is the money shot of the demo.
- **Fix method:** restructure the no-screenshot branch into the ISS-023 placeholder language
  already used by the report's Website card (`DiagnosticModules#WebsiteBeforeCard`, landed in
  9281e93): a framed 4:3 tile with an `ImageOff` glyph, the neutral headline "Website preview
  unavailable" and one sentence of guidance ("Re-run the audit to capture it again"), plus
  the allowlisted reason line. The extracted text and original photos are demoted to a
  collapsed `<details>` disclosure ("Show the text we read from your site") — kept, because
  it is real evidence, but never the main visual. `overflow-hidden` + `break-words` on every
  text node in the pane, so no long token can overflow the split container again.
- **Touched files:** `components/preview/BeforePanel.tsx`, `docs/ISSUES.md`.
- **Regression guard:** `tests/screenshotStatus.test.ts` still pins the string sanitizer
  (ISS-023). Visual guard for this issue: with `before_screenshot.ok === false`, the Before
  pane must show the placeholder tile as its first element and must NOT render any section
  text above the fold — verified in a dev-server run against a REPLAY audit with the capture
  removed. If this reverts, symptom: the split view's left half is a text dump again.

---

## ISS-029 — After page passes a harvested original off as the optimization result

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-029-after-panel-honest-fallback`.
- **Verification (real end-to-end run):** dev server, REPLAY audit
  `2a8bfbf5-ed46-4e50-b402-b29e1f8ed10b`. (a) Unmodified — both images are genuinely
  generated, so the card renders exactly as before with its "AI concept" badge and NO
  fallback copy: the fix does not fire a false positive. (b) The failure path was then
  driven for real by writing the ISS-028 contract into that audit's stored `preview_json`
  (`hero.image_source="harvested_fallback"` + a raw
  `generation_error_reason` containing "timed out after 120000ms", and
  `about_team.team_image_ref=null`): the hero rendered the photo with a "Your current
  photo" chip and "A new image wasn't generated this time — this is the photo already on
  your site.", the team slot rendered the placeholder card, and the raw error string never
  appeared anywhere in the DOM. The database row was restored to its original values
  afterwards. Gates green: `tsc --noEmit`, `vitest run` (403), `next build`.
- **Found:** 2026-07-21, truth review of the Before/After preview.
- **Symptom:** when image generation fails, the same real photo appears on BOTH sides of
  the split view — and the right-hand (After) copy carries no badge and no explanation, so
  it reads as "here is your new, improved image". When there is no image at all, the whole
  block simply disappears, which quietly hides that anything was missing.
- **Root cause (FACT):**
  1. `lib/improve/preview.ts:78-86` (`resolveImageRef`) silently falls back to
     `best_existing_asset_id`, and then to the audit-wide best real photo — a picture
     harvested from the business's own website during THIS audit. The fallback is a good
     product decision; it is only dishonest because it is invisible.
  2. `components/preview/AfterPanel.tsx:101` (hero) and its team counterpart rendered
     `{asset?.url && <ZoomableAssetImage …/>}`: an image if there is one, nothing at all if
     there is not, and no distinction between the two cases. `AssetImage`'s "AI concept"
     badge only fires on a labelled asset, so the fallback rendered completely bare.
- **Severity:** high — this is a truth-discipline violation on the demo's money shot.
- **Fix method (components/** only, no `lib/**` change):**
  - New pure module `components/preview/afterImageState.ts` classifies each After image
    slot as `generated` | `harvested_fallback` | `none`.
  - Source of truth, in order: (1) the ISS-028 backend contract, read defensively as
    `hero.image_source` / `about_team.image_source` plus `generation_error_reason`; (2) the
    asset's own truth label, which the product already uses for exactly this distinction
    (FEA-110) — a generated/edited image carries `ai_concept`/`enhanced`, a harvested
    original carries none. **The fix therefore works today, before ISS-028 lands**, and
    tightens automatically once it does.
  - **Schema note (FACT as of this fix; superseded by ISS-028/ISS-031 — see the follow-up
    on ISS-031):** `PreviewJson` in `lib/schemas.ts` was a strict zod object that
    STRIPPED unknown keys — reading the new fields off `parsed.data` would always yield
    `undefined`. `app/audit/[id]/preview/page.tsx` therefore reads them off the RAW
    `audit.preview_json` blob and passes them down as `imageMeta`.
  - New `AfterImageSlot` component in `AfterPanel` renders all three outcomes:
    generated → unchanged (AI concept badge); harvested fallback → the photo with NO
    AI badge, a "Your current photo" chip and the sentence "A new image wasn't generated
    this time — this is the photo already on your site."; none → a designed placeholder
    card in the ISS-023/ISS-026 language, so the block never silently vanishes.
- **Touched files:** `components/preview/afterImageState.ts` (new),
  `components/preview/AfterPanel.tsx`, `components/preview/SplitView.tsx`,
  `components/preview/PreviewOverlay.tsx`, `app/audit/[id]/preview/page.tsx`,
  `tests/afterImageState.test.ts`, `docs/ISSUES.md`.
- **Dependency:** ISS-028 (backend persists `image_source` / `generation_error_reason`).
  Not blocking — the label heuristic covers it meanwhile. The raw
  `generation_error_reason` is deliberately NOT rendered here; ISS-030 owns mapping image
  generation errors to allowlisted copy.
- **Regression guard:** `tests/afterImageState.test.ts` — an unlabelled After image must
  classify as `harvested_fallback` (never `generated`), an absent one as `none`, and an
  explicit backend declaration must beat the heuristic. If this reverts, symptom: the same
  photo shows on both sides of the split view with the right one implying it is new.

---

## ISS-027 — Every generated image times out: the configured image model is slower than the budget

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-027-image-model-timeout`.
- **Found:** 2026-07-21, live "Do It For You" run — audit `8d710379`, all three image
  channels failed.
- **Symptom:** every image channel of a LIVE improve run finishes with
  `generation_error: "... timed out after 120000ms"`. The After page therefore never shows
  a generated image at all; the F-053 ladder silently degrades to harvested originals for
  the whole demo.
- **Root cause (FACT, measured on this account with the same key and parameters):**
  `OPENAI_MODEL_IMAGE=gpt-image-2` (and the same default fallback in
  `lib/agents/openai.ts:37`) is far slower than the 120s per-call budget
  (`lib/improve/image.ts` `DEFAULT_IMAGE_TIMEOUT_MS`): `gpt-image-2` at 1536x1024/medium
  did **not return within 500s**, and even 1024/low took **135.8s** — already over budget.
  `gpt-image-1` at 1536x1024/medium returned in **27.7s**. Audit `8d710379`'s three
  concurrent images all failed at exactly the 120s mark (`progress_events` corroborate).
  The timeout machinery (ISS-007) was working correctly; the model choice was wrong.
- **Severity:** high (judge-visible) — the product's headline capability produced nothing.
- **Fix method:**
  1. **Model.** `OPENAI_MODEL_IMAGE=gpt-image-1` in `.env` and `.env.example` (with the
     measurement recorded as a comment) and the same default in `lib/agents/openai.ts`, so
     a missing env var can no longer select a model that cannot finish inside the budget.
  2. **Downgrade retry.** `lib/improve/image.ts` routes every `images.generate` /
     `images.edit` call through `callImageWithDowngrade`: on a timeout, an API error, or an
     empty response it retries **exactly once** at `quality: "low"` on
     `OPENAI_MODEL_IMAGE_FALLBACK` (default: the same model) with **half** the remaining
     timeout budget, so a slow call costs at most 1.5× the budget instead of hanging the
     stage twice. Only a second failure produces `generation_error`, and the reported
     message keeps the PRIMARY cause with the retry's failure appended — neither is hidden.
     The existing failure-ladder structure (`{asset, shot_brief, generation_error}`) is
     unchanged.
  3. **Timing telemetry.** Every image call is timed (`ImageCallTiming`: duration, attempt
     count, model/quality actually used, whether it downgraded). The duration lands in the
     audit's own `progress_events` (`generating_images` detail, success *and* failure) via
     `lib/improve/orchestrate.ts`, and on a successful asset's `meta_json`
     (`duration_ms` / `model` / `quality` / `downgraded_retry`). "All images hit the 120s
     wall" is now visible in the run's own evidence.
- **Touched files:** `.env`, `.env.example`, `lib/agents/openai.ts`, `lib/improve/image.ts`,
  `lib/improve/orchestrate.ts`, `tests/improve.test.ts`, `docs/ISSUES.md`.
- **Verification (real end-to-end run):** a real `generateChannelImage({channelId:
  "hero_image"})` call against the live OpenAI key, 1536x1024/medium, temp DB + temp
  storage: **24.7s wall clock**, `timing = {duration_ms: 24725, attempts: 1, model:
  "gpt-image-1", quality: "medium", downgraded: false}`, `generation_error: null`, asset
  written and labeled `ai_concept`. Gates green: `tsc --noEmit`, `vitest run` (405),
  `next build`.
- **Regression guard:** `tests/improve.test.ts` — "ISS-027: a failed primary generation is
  retried ONCE at quality=low …" (asserts 2 calls, medium→low, a smaller retry timeout, and
  `downgraded_retry` on the asset meta), "the downgrade retry happens at most once — a
  second failure reports the PRIMARY cause", plus the model assertions pinning
  `gpt-image-1` and the `generating_images` timing-detail assertion in the full-run test.
  If this reverts, symptom: image channels fail again with "timed out after 120000ms" and
  no duration appears in `progress_events`.
- **Follow-up 2026-07-21 (human decision — the model swap is REVERTED, the issue stays
  fixed):** `OPENAI_MODEL_IMAGE` is back to **gpt-image-2**, chosen for quality; switching
  image models to escape a timeout is no longer an allowed remedy (`.env.example` and
  `lib/agents/openai.ts` say so at the point of change). What this issue actually
  discovered still stands, and re-measurement sharpened it: gpt-image-2's latency is
  **variable**, not uniformly slow — the same 1536x1024/medium hero call measured
  **>500s** (this issue) and **38.5s** (2026-07-21 control), so a fixed 120s cap was a coin
  flip rather than a wrong-model detector. The timeout is now solved by **FEA-112**:
  generation is asynchronous (the report completes without waiting), the official streaming
  path surfaces a first partial frame in ~13s, a per-event stall guard (120s of silence)
  replaces the total-duration cap as the "is it dead?" test, and the total budget is 900s.
  ISS-027's other two fixes survive unchanged: the single retry (now same-model
  `quality: "low"` — the model-switching env knob is deleted) and the duration telemetry in
  `progress_events` / asset `meta_json`. No new issue id is opened for this; this entry is
  the record.

---

## ISS-030 — Raw image-pipeline provider errors rendered in the report

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-030-generation-error-whitelist`.
- **Found:** 2026-07-21, follow-up sweep after ISS-023 — the same class of leak, missed the
  first time because it lives on a different failure path.
- **Root cause (FACT):** `components/report/BeforeAfterInline.tsx:425-427` interpolated
  `after.generation_error` verbatim ("Image generation didn't complete this time —
  {generationError}."), and :484-487 did the same with `after.edit_error`. Those strings are
  written by `lib/improve/orchestrate.ts:236,269` and `lib/improve/image.ts:368` as
  `` `Image generation failed: ${message}` `` where `message` is an unmodified provider SDK
  error — e.g. "Request timed out after 120000ms", a 429 rate-limit body carrying an
  organization id, a 401 carrying a partially-masked API key, or a Node stack fragment.
- **Severity:** medium-high — judge-visible machine text on the demo path, and a credential
  string is one provider error away from the screen.
- **Fix method:** new `components/report/generationStatus.ts`, the same allowlist pattern
  `lib/client/screenshotStatus.ts` uses for ISS-023 — `imageGenerationFailureCopy()` /
  `imageEditFailureCopy()` return copy from a fixed table, `logGenerationDiagnostics()`
  sends the raw string to the console, and **no part of the input is ever concatenated into
  the output**. One structural difference is recorded in the module header: screenshot
  records carry a machine-readable `reason` to key on, these carry only free provider text,
  so `classifyGenerationFailure()` is a heuristic over that text — safe only because every
  branch, default included, returns allowlisted copy. Both render sites also gained
  `overflow-hidden` + `break-words`.
  - New module lives under `components/` on purpose: `lib/improve/**` is the backend lane's
    owned path and was not touched.
- **Sweep (part of this issue):** every other `*_error` / `detail` render point in
  `components/**` and `app/**` was re-checked. `ChannelRow`, `ReportView`, `ActionStrip`,
  `DiagnosticModules`, `BeforePanel` and the report's Website card already route through
  `safeUiText`/`screenshotFailureCopy` (ISS-023). These two were the last raw ones; the
  class is now closed.
- **Second half of the fix — the raw string must not reach the browser AT ALL.** Live
  testing showed that even with the render fixed, `generation_error` was still serialized
  into the page as a React prop and into `GET /api/audits/:id`, i.e. readable page source.
  A 401 body carries a key prefix, so "unrendered" is not good enough. Both serialization
  points now redact: `app/audit/[id]/page.tsx` and `app/api/audits/[id]/route.ts` run the
  channel's `after` blob through `redactChannelAfter()`, which replaces the raw text with
  its classified kind token (`"timeout"`, `"auth"`, …) and logs the raw string to the
  SERVER console — the last place it exists. `classifyGenerationFailure()` accepts the
  token, so the copy the user sees is unchanged.
- **Touched files:** `components/report/generationStatus.ts` (new),
  `components/report/BeforeAfterInline.tsx`, `app/audit/[id]/page.tsx`,
  `app/api/audits/[id]/route.ts`, `tests/generationStatus.test.ts`, `docs/ISSUES.md`.
- **Regression guard:** `tests/generationStatus.test.ts` — the real provider-error shapes
  (timeout / 429 with an org id / safety rejection / 401 with a key prefix / ECONNRESET
  stack) must produce copy containing none of "120000", "429", "401", "sk-", "org-",
  "node:internal" or "failed:", and every unrecognized input must fall through to neutral
  copy. If this reverts, symptom: "…timed out after 120000ms" appears inside a sentence on
  the report page. A second block guards the redaction: `redactChannelAfter` must turn a
  401-with-key-prefix into `"auth"` and leave every other field intact.
- **Verification (real end-to-end run):** dev server, REPLAY audit
  `2a8bfbf5-ed46-4e50-b402-b29e1f8ed10b`, with a realistic raw error written into the
  `hero_image` channel's `after_json` ("Image generation failed: 429 Rate limit reached for
  images in organization org-abc123. Request timed out after 120000ms") and its
  `generated_asset_id` removed. Expanding that channel rendered "This image took too long to
  generate and was stopped. You can try it again. No image is shown here rather than showing
  something fake." — no fragment of the raw string anywhere in the DOM. `GET
  /api/audits/:id` returned `"timeout"` in place of the raw text. A PRODUCTION build
  (`next build` + `next start`) served the report page with zero occurrences of "120000ms",
  "org-abc123" or "Rate limit" in the HTML source. (In `next dev` the raw string still
  appears once in the page stream — that is Next's dev-only forwarding of SERVER console
  output to the browser overlay, i.e. exactly the diagnostics channel this fix routes it
  to; it is absent from the production output.) The database row was restored afterwards.
  Gates green: `tsc --noEmit`, `vitest run` (409), `next build`.
---

## ISS-028 — Generation failures are swallowed by the preview data layer

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-028-preview-generation-provenance`.
- **Found:** 2026-07-21, root-cause work on ISS-027 (all three images timed out, yet the
  preview looked complete).
- **Symptom:** when image generation fails, `assemblePreview` quietly substitutes a photo
  harvested from the customer's own website during this same audit. The stored
  `preview_json` carries no trace of the failure, so the After renderer has no way to
  distinguish "we generated this" from "this is your own old photo" — the failure is
  invisible to the UI and to the judge.
- **Root cause (FACT):** `lib/improve/preview.ts` `resolveImageRef` implements a three-rung
  fallback (`generated_asset_id` → `best_existing_asset_id` → `pickBestExistingAsset`) and
  returns only a bare `string | null`. The `PreviewJson` contract had no field for either
  the rung taken or the channel's recorded `after_json.generation_error`, so both were
  dropped at the data layer.
- **Severity:** high — truth discipline on the demo's money shot (paired with ISS-029,
  which fixes the rendering side and consumes these fields).
- **Fix method (data layer only — the fallback BEHAVIOR is deliberately unchanged, F-054
  "the preview is never cut" still holds):**
  - `lib/schemas.ts`: two new enums, `PreviewImageSource` (`"generated" |
    "harvested_fallback"`) and `GenerationErrorReason` (`"timeout" | "api_error" |
    "missing_api_key" | "no_image_data" | "unknown"`). `PreviewJson.hero` and
    `PreviewJson.about_team` each gain OPTIONAL `image_source` and
    `generation_error_reason`; gallery entries gain optional `image_source`. Optional-only
    additions — every previously stored `preview_json` still parses. (Frozen-schema change
    agreed with the frontend lane up front; field names are the agreed contract.)
  - `lib/improve/preview.ts`: `resolveImageRef` now returns `{ref, image_source,
    generation_error_reason}` reporting which rung it actually hit;
    `resolveHero`/`resolveAboutTeam` pass it through; `resolveGallery` tags each tile from
    the asset's own `kind`.
  - `normalizeGenerationErrorReason` (exported) maps the channel's raw
    `after_json.generation_error` to a whitelisted CODE. The provider's raw message is
    never copied into `preview_json` — it can carry local paths and stack text; unknown
    text degrades to `"unknown"` instead of leaking through.
- **Touched files:** `lib/schemas.ts`, `lib/improve/preview.ts`, `tests/improve.test.ts`,
  `docs/ISSUES.md`.
- **Verification (real data):** `assemblePreview` re-run against the real failed audit
  `8d710379-7f50-4297-9aa6-dee920afae30` (WAL-consistent copy of `storage/app.db`, whose
  hero/team channels hold the "timed out after 120000ms" errors from ISS-027):
  `hero = {ref: "b198e217…", image_source: "harvested_fallback",
  generation_error_reason: "timeout"}` and the same for `about_team` — previously both were
  a bare ref indistinguishable from a real generation. Gates green: `tsc --noEmit`,
  `vitest run` (407), `next build`.
- **Regression guard:** `tests/improve.test.ts` — "ISS-028: a failed generation that falls
  back to a harvested photo is labeled harvested_fallback with a whitelisted reason"
  (asserts both slots, that the harvested ref is still served, and that `"120000ms"` never
  appears anywhere in the serialized preview), "normalizeGenerationErrorReason only ever
  emits whitelisted codes", and an added assertion on the happy-path preview test that a
  genuinely generated hero reports `image_source: "generated"` with no reason. If this
  reverts, symptom: the After page silently shows the customer's own photo as the AI result
  again (ISS-029 renders its honest states from exactly these fields).

---

## ISS-031 — One unrecognized provenance value invalidates the entire PreviewJson

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-031-previewjson-schema-fields`.
- **Found:** 2026-07-21, follow-up on a report that `PreviewJson.safeParse` was *stripping*
  the ISS-028 fields (`hero.image_source` / `generation_error_reason`), which had the
  frontend reading the raw `audit.preview_json` in
  `app/audit/[id]/preview/page.tsx` to work around it.
- **Investigation result (FACT — the reported symptom does NOT reproduce on `main`):** the
  fields were added to the zod schema by ISS-028 itself and survive a parse. Measured on
  `e1a6819`: `PreviewJson.safeParse` on a preview carrying
  `hero.image_source: "harvested_fallback"` / `generation_error_reason: "timeout"` returns
  both values intact, and `assemblePreview` — whose return value is itself a
  `PreviewJson.parse()` result — reports them for the real failed audit `8d710379`. The
  stripping report was measured against a checkout from BEFORE `fix/iss-028` merged
  (`e1a6819`, minutes earlier). No schema field was missing.
- **Real defect found while verifying that (FACT):** `generation_error_reason` was a strict
  `z.enum`, so a value outside the whitelist failed the parse of the **whole**
  `PreviewJson` — not just that one field (measured: `hero.generation_error_reason =
  "Image generation timed out after 120000ms"` → `success: false`,
  `invalid_value` at `["hero","generation_error_reason"]`). `preview_json` is a stored
  blob: a hand-edited demo row (exactly what ISS-029's verification wrote) or any other
  writer could therefore cut the entire preview that F-054 promises is never cut.
- **Severity:** medium — narrow trigger, but its blast radius is the whole preview.
- **Fix method:** `lib/schemas.ts` wraps both provenance fields in shared field schemas —
  `PreviewImageSourceField = PreviewImageSource.optional().catch(undefined)` and
  `GenerationErrorReasonField = GenerationErrorReason.optional().catch("unknown")` — used
  by `hero`, `about_team`, and gallery tiles. The whitelist is still the only thing a
  reader can ever observe (raw provider text still cannot survive a parse); an unrecognized
  value now degrades to `"unknown"` / absent instead of invalidating the document. No
  existing field changed; no field became required.
  **Frozen-file note:** `lib/schemas.ts` is frozen — this change was explicitly approved by
  Mission Control under the "optional additions only, no change to existing fields"
  principle (same approval that covered ISS-028).
- **Touched files:** `lib/schemas.ts`, `tests/schemas.test.ts`, `docs/ISSUES.md`.
- **Verification (real data):** `assemblePreview("8d710379-…")` against a WAL-consistent
  copy of the real `storage/app.db` → `hero = {image_source: "harvested_fallback",
  generation_error_reason: "timeout"}` both from the freshly assembled (parsed) object and
  after a store→JSON→re-parse round trip. Gates green: `tsc --noEmit`, `vitest run` (417),
  `next build`.
- **Regression guard:** `tests/schemas.test.ts` — "PreviewJson provenance fields
  (ISS-028/ISS-031)": the fields survive a parse, stay absent when never set, and an
  unrecognized value degrades (`"unknown"` / undefined) while `"120000ms"` never survives.
  If this reverts, symptom: either the After page loses its honesty signals again, or one
  odd stored value blanks the whole preview.
- **Follow-up for the frontend lane (not a defect here):** the workaround in
  `app/audit/[id]/preview/page.tsx` that reads the raw `audit.preview_json` to recover these
  fields is no longer needed — the parsed value carries them.
- **Follow-up DONE — 2026-07-21, branch `chore/iss-031-remove-raw-preview-workaround`
  (frontend lane).** `app/audit/[id]/preview/page.tsx` now builds `imageMeta` from
  `parsed.data` instead of `audit.preview_json`; the stale rationale comments in
  `components/preview/afterImageState.ts` (written when `PreviewJson` still stripped the
  fields, see ISS-029) were corrected. `readAfterImageMeta` keeps its defensive reads on
  purpose — see the measured behaviour below.
  - **Measured on the real row (FACT, `8d710379-7f50-4297-9aa6-dee920afae30`, read-only
    against `storage/app.db` via the real `PreviewJson.safeParse`):**
    (A) a full ISS-028 payload survives the parse — `hero = {image_source:
    "harvested_fallback", generation_error_reason: "timeout"}`, `about_team.image_source =
    "generated"`; (B) an unrecognized `image_source` (`"magic_beans"`) parses fine but the
    KEY IS DROPPED — it degrades to *absent*, not to `"unknown"`, which lands in
    `resolveAfterImageSource`'s "not declared" branch and falls back to the asset-label
    heuristic; (C) an unrecognized `generation_error_reason` degrades to `"unknown"`;
    (D) a legacy row carrying neither field still parses. That row's OWN stored
    `preview_json` predates ISS-028 and has no provenance fields at all, so for it raw and
    parsed are identically empty — i.e. this change is behaviourally neutral there, and the
    pass-through is proven by (A).
  - **Touched files:** `app/audit/[id]/preview/page.tsx`,
    `components/preview/afterImageState.ts`, `docs/ISSUES.md`. No behaviour change intended;
    `tests/afterImageState.test.ts` (ISS-029) still guards the classification.

---

## ISS-032 — Images arrive after "complete", but the page has stopped listening

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-032-live-image-arrival`.
- **Found:** 2026-07-21, frontend follow-up to FEA-112 (async image generation, `e5e40b2`).
- **Symptom:** the report is ready in ~33s and the images stream in over the following
  minute. The visitor sees the honest placeholders, and then nothing — the finished images
  only appear if they reload the page by hand. On the Before/After preview, the money shot
  of the demo, the same reload was needed.
- **Root cause (FACT), three independent stoppages:**
  1. `lib/client/poll.ts` treated `status: "complete"` as "nothing left to watch":
     `isActive()` returned false, and the SSE `complete` handler closed the EventSource
     outright. `app/api/audits/[id]/events/stream.ts:6` marks `complete` TERMINAL, so the
     server closes too — after that the page received nothing at all, while
     `images_pending > 0` said the work was still running.
  2. `components/preview/PreviewOverlay.tsx` had **no live updates whatsoever** — the
     overlay is rendered from server state and never polled.
  3. Even with fresh data, the pixels could not change: a generated image is replaced IN
     PLACE (same asset id, same `storage_path`) when the final frame overwrites the
     partial, and `app/assets/[...path]/route.ts` served every file with
     `Cache-Control: public, max-age=31536000, immutable`. The browser had no reason to
     re-request the URL, so the soft partial was frozen in place.
- **Severity:** high — judge-visible on the demo path; the product looked like it had
  simply failed to produce the images it had in fact produced.
- **Fix method (frontend lane):**
  - `lib/client/poll.ts`: `images_pending` joins the liveness test; the `complete` handler
    re-reads the canonical payload and hands over to the fallback poller instead of going
    silent. New `nextPollDelayMs()` gives images-only waiting a relaxed **3s** cadence
    (1s stays for a genuinely running pipeline, 5s idle). Both helpers are exported so the
    cadence is unit-testable without a DOM.
  - `lib/client/types.ts`: `images_pending?: number` added to `AuditPollResponse`.
    **Lane note:** these two files are UI plumbing under `lib/client/**`, not the backend's
    `lib/improve/**` / `lib/pipeline/**`; no backend-owned module was touched.
  - `components/report/ReportView.tsx`: the `router.refresh()` signature keyed only on
    IMPROVED channel ids, which misses every partial (a partial publishes a
    `generated_asset_id` while the channel stays `improving`) and misses a final frame
    replacing a partial under the same id. It now keys on `images_pending` plus each
    channel's `status` AND current `generated_asset_id`.
  - `components/preview/PreviewOverlay.tsx`: subscribes to the same endpoint and refreshes
    the server tree on that signature, so the Before/After view updates itself.
  - `app/_lib/assetVersion.ts` (new, server-only, Next private folder): stamps
    `/assets/...` URLs with the file's mtime (`?v=<mtimeMs>`). Same bytes → same URL →
    cache hit; replaced bytes → new URL → the `<img>` re-fetches. The version comes from
    the filesystem because the file is what changes — the asset ROW is untouched by an
    in-place overwrite. Applied in both `app/audit/[id]/page.tsx` and
    `app/audit/[id]/preview/page.tsx`.
  - `app/assets/[...path]/route.ts`: `immutable` was a lie for exactly the files that
    change. A stamped request (`?v=`) is content-addressed and still cached hard; an
    unstamped one revalidates against an mtime+size `ETag` (304, no body, when unchanged).
  - `components/preview/AfterPanel.tsx`: a slot whose payload carries
    `generation_pending` shows a neutral "Sharpening — a clearer version is on its way"
    chip (pulsing dot, no spinner theatre), and the harvested-fallback copy switches to
    "Your new image is still being generated…" while it is pending. Both disappear when the
    final frame lands.
  - **`partial_only` (optional item, DONE):** `meta_json.partial_only` — a streamed partial
    whose final frame never arrived (`lib/improve/image.ts:827`) — is surfaced through
    `AssetLookup.partialOnly` and labelled "Early frame — the sharper version didn't
    finish". A real render of the business's image, just soft: labelled, not hidden.
- **Touched files:** `lib/client/poll.ts`, `lib/client/types.ts`,
  `components/report/ReportView.tsx`, `components/preview/PreviewOverlay.tsx`,
  `components/preview/AfterPanel.tsx`, `components/preview/afterImageState.ts`,
  `components/preview/types.ts`, `app/_lib/assetVersion.ts` (new),
  `app/assets/[...path]/route.ts`, `app/audit/[id]/page.tsx`,
  `app/audit/[id]/preview/page.tsx`, `tests/pollCadence.test.ts` (new),
  `tests/afterImageState.test.ts`, `docs/ISSUES.md`.
- **Regression guard:** `tests/pollCadence.test.ts` — a `complete` audit with
  `images_pending > 0` must stay live at 3s; `images_pending: 0` and an ABSENT counter
  (pre-FEA-112 payload) must both go idle at 5s, so the page neither stops early nor polls
  forever. `tests/afterImageState.test.ts` pins `generation_pending` reading and that a
  pending image is still classified `generated`. If this reverts, symptom: images never
  appear without a manual reload, or the soft partial never sharpens.

- **Verification (real stack, production build + `next start`, no page reload at any point).**
  Driven against the real LIVE audit `066116d9-…` (storage-backed generated images), with
  its hero channel put into the exact FEA-112 in-flight state — `status: "complete"` +
  `images_pending: 1`, channel `improving` with `partial: true`, `hero.generation_pending`
  set — then the final frame written **in place** (different bytes, same asset id, same
  `storage_path`) while both pages stayed open:
  - **Preview overlay:** hero rendered as `/assets/…/hero_image.png?v=1784588622290` with the
    "Sharpening — a clearer version is on its way" chip. After the in-place replacement, and
    with no reload, the src became `?v=1784666079403`, the new pixels painted, and the chip
    disappeared. `fetch` counter on the page: 11 calls to `/api/audits/:id` — i.e. it kept
    listening after `complete`, which is precisely what it used to stop doing.
  - **Report page:** same cycle — 5 polls after `complete`, and the expanded channel's image
    src advanced to the new mtime by itself.
  - Both pages were served by `next build` + `next start`, not the dev server.
  - Every mutated row and the image file were restored afterwards and re-verified byte-for-byte
    (`channel: improved`, no `partial` flag, no `generation_pending`, hero file identical to
    the backup).
- **Verification 2 — a REAL LIVE audit (FACT).** Authorized by Mission Control 2026-07-21;
  one throwaway audit `97100a3a-…` of muster-sanitaer.example, production build on an isolated
  worktree, driven through the UI (the FEA-111 global CTA), **no manual page reload at any
  point**. Measured:
  - analyze → `scored` in **26s**; clicking "Do It All For You" put the audit at
    `status: "complete"` **6s** later while `images_pending: 3` — precisely the state that
    used to freeze the page.
  - `images_pending` counted down 3 → 2 (+37s) → 1 (+55s) → 0 (+61s) as the images landed.
  - The report page, open and untouched throughout, painted each generated image the moment
    it landed: `hero_image.png?v=1784666435268` at +43s, `team_image.png?v=1784666452820`
    at +61s, `work_proof_images.png?v=1784666457966` at +68s. It issued **30** requests to
    `/api/audits/:id` over the run, i.e. it kept listening long past `complete`.
  - Server-side timings from the audit's own progress log: partials published at 12.4s /
    14.2s / 24.1s, finals at 38.5s / 56.0s / 61.2s (gpt-image-2/medium).
- **Verification 3 — the partial window, caught live (FACT; closes the last ASSUMPTION).**
  Verification 2 missed the `generation_pending` window because the browser sat on the
  report page while the partials published (12-24s), and a retry on that audit was skipped
  by the per-audit image budget. Re-run with a second throwaway LIVE audit
  `e18fadac-…` (muster-sanitaer.example), authorized 2026-07-21, production build, browser parked on
  `/audit/:id/preview` from the moment `preview_ready` flipped, **no reload at any point**.
  Sampled every 400ms:
  - **t=0s** — no generated image yet: the harvested-fallback slot with the pending wording
    "Your new image is still being generated — this is the photo already on your site until
    it lands."
  - **t=2s** — first partial lands (`work_proof_images.png?v=1784666770112`).
  - **t=4s** — hero `?v=1784666774811` and team `?v=1784666772438` partials render, visibly
    soft, with the "Sharpening — a clearer version is on its way" chip; the fallback copy is
    gone because the slot now holds a real (early) render.
  - **t=38s** — the hero FINAL replaces the partial IN PLACE: same filename, version moves
    `1784666774811 → 1784666805359`, and the sharp frame paints. This is the exact swap the
    `immutable` header used to make impossible.
  - **t=44s** — team `?v=1784666812528` and work_proof `?v=1784666811805` finalize; the
    Sharpening chip disappears on its own.
  - 16 requests to `/api/audits/:id` across the window; analyze had taken 24s.
  Screenshots: `iss-032-live-sharpening-partial` (soft partial + chip),
  `iss-032-live-final-frame` (same slot, sharp, no chip).
- **Observed, not a defect, flagged for triage:** the REPORT page never surfaces a streamed
  partial at all — `ChannelRow` only reveals imagery once a channel reaches `improved`, so
  between +0s and ~+40s an image channel shows "improving" and nothing else. That is honest
  (it does not claim anything false), so it is not registered as a defect here; whether the
  report page SHOULD show partials is a feature decision for `docs/FEATURES.md`.
- **Gates:** `tsc --noEmit`, `vitest run` (29 files / 427 tests), `next build` — all green.

---

## ISS-033 — A deliberate "skip" renders as an empty panel

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-033-consume-taxonomy-fields`.
- **Found:** 2026-07-21, frontend follow-up to FEA-114 (image taxonomy + composition
  quotas, `a9dfd10`).
- **Root cause (FACT):** FEA-114 lets the planner DECIDE not to generate an image when the
  business's own photos already cover that category — it writes `skipped_reason` on the
  channel and leaves `generated_asset_id` null with `generation_error: null`
  (`lib/improve/image.ts:895`, `lib/improve/orchestrate.ts:285-286`). `ImageReveal` in
  `components/report/BeforeAfterInline.tsx` branches on `generatedAsset ? … : failed ? … :
  null`, and `failed` requires a `generation_error` — so a skip fell through to `null`.
  The channel showed **"Improved ✓" with an empty result panel**: no image, no error, no
  words. The best possible outcome ("you already have a real photo of this, we didn't
  invent one") was displayed as if the product had quietly failed.
- **Severity:** medium-high — judge-visible, and it undersells the exact behaviour that
  makes the product trustworthy.
- **Fix method:**
  - New pure module `components/report/imageCategory.ts` — `isSkippedOnPurpose()`,
    `skippedOnPurposeCopy()`, `imageCategoryLabel()`.
  - `ImageReveal` gains a `skipped` branch BEFORE `failed`, rendering a green-check card:
    **"Skipped on purpose — Your own photos already cover <what>, so nothing was generated
    here. Real photos beat an AI concept every time — we only add one where you are missing
    a shot."**
  - **The raw `skipped_reason` is never rendered** (ISS-023/ISS-030 rule): it is internal
    planner prose carrying enum names and quoted internals ("work_result is already covered
    and every other shot-list category for this trade is too…"). The copy is keyed off the
    `content_category` enum instead; an absent/unknown category still yields honest generic
    wording.
  - **Category chips (`components/report/CategoryChip.tsx`, new):** `hero.image_category`,
    `about_team.image_category` and `gallery[].category` render a quiet outline chip
    ("Work result", "Team", "Storefront", …). Deliberately LOWER contrast than the truth
    badges beside them — "AI concept" / "Your current photo" answer *where an image came
    from* and must not be competed with; the chip only answers *what it depicts*. Applied
    in `AfterPanel` (hero, team, concept gallery, kept originals) and `ServicesSubpage`.
  - Every field is read defensively; an absent or unrecognized category renders NO chip
    rather than a wrong one.
- **Touched files:** `components/report/imageCategory.ts` (new),
  `components/report/CategoryChip.tsx` (new), `components/report/BeforeAfterInline.tsx`,
  `components/preview/AfterPanel.tsx`, `components/preview/ServicesSubpage.tsx`,
  `tests/imageCategory.test.ts` (new), `docs/ISSUES.md`. No `lib/**` change.
- **Verification (production build + `next start`):**
  - **Chips, real FEA-114 data:** LIVE audit `e18fadac-…` (hero `work_result`, team `team`,
    gallery `work_result/storefront/team`) — the preview rendered "Work result", "Team" and
    "Storefront" chips alongside the existing "AI concept" badges. Screenshot
    `iss-033-category-chips`.
  - **The skip branch:** the real planner string was injected into that audit's
    `work_proof_images` channel (`skipped_reason` + `content_category: "storefront"`,
    `generated_asset_id` removed). The report row rendered "Skipped on purpose" + a
    "Storefront" chip + the positive sentence, followed by the existing shot-list brief —
    and **no fragment of the raw reason** ("shot-list", "storefront is already…") appeared
    anywhere in the DOM. Screenshot `iss-033-skipped-on-purpose`. The row was restored
    afterwards and re-verified.
  - **Legacy data:** audit `97100a3a-…` (pre-FEA-114, no category fields) renders the page
    normally with ZERO chips — no wrong labels on old rows.
  - Gates: `tsc --noEmit`, `vitest run` (31 files / 447 tests), `next build` — all green.
- **Regression guard:** `tests/imageCategory.test.ts` — the real `skipped_reason` string
  must never appear in the copy (no "work_result", no "shot-list"), a skip must be detected
  from the `after` blob (and NOT from an empty/wrong-typed value), and every unknown or
  absent category must yield `null` from `imageCategoryLabel` so no wrong chip renders. If
  this reverts, symptom: a channel the planner deliberately skipped shows an empty result
  panel again.

---

## ISS-034 — Classification gaps let a listing screenshot become the page hero

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-034-classification-quality`.
- **Found:** 2026-07-21, human acceptance review of a fresh LIVE Muster + Sohn audit
  (`db3aeca0-c01d-4209-84d8-cb5483b478d8`): the After page's hero was an "Enhanced" version
  of a picture of three cars parked in front of a building — irrelevant to a plumbing
  business and unappealing as a headline.
- **Root cause (FACT, from that audit's own rows — three faults compounding):**
  1. **Classification never saw the image.** FEA-114 reused `prepareImagesForVision`, which
     serves the SCORING pass: ≤8 harvested images, `status = "normalized"` only. The image
     in question was an UPLOADED asset in status `consumed` (the raw upload row kept beside
     its normalized copy), so it was never classified and fell back to `other` at 0.2
     confidence via the keyword heuristic.
  2. **The edit-source picker had no content awareness.** `resolveEditableSource` used
     `pickBestExistingAsset`, which ranks by summed vision score — and in this audit
     **every asset is unscored** (`score_json` null on all 14 rows). The ranking therefore
     degenerated to "first row inserted", which was that uploaded asset.
  3. **The image was in fact a Google-listing SCREENSHOT.** Re-classified with the new
     prompt it reads `other` @0.99, subject "Google business listing screenshot". The image
     model "enhanced" it into a plausible-looking building-with-cars photo — exactly the
     garbling ISS-019 exists to prevent, which its keyword gate could not catch because the
     asset had no alt text, no src and no vision evidence to match against.
- **Severity:** high (judge-visible) — the hero is the page's single most important image,
  and an "enhanced" screenshot is also a truth-label violation.
- **Fix method:**
  - **Coverage.** New `lib/images/classify.ts#prepareAssetsForClassification` gives
    classification its OWN input set: every harvested/uploaded asset with a readable file,
    any status, up to 16. Classification no longer inherits the scoring pass's limits.
  - **Prompt.** `IMAGE_CLASSIFIER_SYSTEM` rewritten into two explicit steps — name the
    DOMINANT subject first, then categorize — with per-category definitions and the
    hard-case rules that were being got wrong: parked vehicles/fleets are always
    `equipment` even with signage behind them; `work_result` requires the finished work
    itself to be the subject; a screenshot of any site/map/listing is `other`; ties go to
    the dominant subject with lowered confidence; never force a fit. `ImageClassification`
    gains a required `subject` field, so a wrong call is visible in the evidence.
  - **Hero priority.** `hero_priority` now leads with `work_result` > `craft_detail` and
    ends with `equipment` for every trade (doctor keeps premises/team first, equipment
    still last).
  - **Content-aware edit sources.** `resolveEditableSource` walks the business's photos in
    CONTENT order (`rankRealPhotosForSlot`) instead of taking one score-ranked pick, for
    BOTH edit paths. It refuses `isKnownUnusableContent` (a confident vision `other` —
    screenshot/logo/map) for any edit, and additionally refuses `equipment`/`credentials`
    for the hero. Crucially, "unknown" is not treated as "known bad": an unclassified photo
    stays editable, so F-096/ISS-008's prefer-the-real-photo behaviour survives a
    classifier outage.
- **Touched files:** `lib/images/classify.ts` (new), `lib/images/taxonomy.ts`,
  `lib/agents/prompts.ts`, `lib/schemas.ts` (required `subject` on the classifier's own
  output schema — not a stored contract), `lib/pipeline/orchestrator.ts`,
  `lib/improve/image.ts`, `tests/taxonomy.test.ts`, `docs/ISSUES.md`.
- **Verification (real data — the exact audit that failed):** re-ran classification against
  `db3aeca0`'s real assets. The new input set is **10 images (was 9 — the uploaded asset
  is now included)**, and the uploaded asset classifies `other` @**0.99**, subject
  "Google business listing screenshot" (was `other` @0.2 heuristic, never looked at). The
  eight real photos classify `work_result` @0.62–0.96 / `craft_detail` @0.90–0.94 with
  concrete subjects ("finished tiled bathroom", "basin taps and fittings"). Hero source
  selection on that same audit now returns **`f4386596` [work_result] "finished tiled
  bathroom"**, and `isHeroEditableCategory(screenshot)` is **false**. Gates green:
  `tsc --noEmit`, `vitest run` (452), `next build`.
- **Regression guard:** `tests/taxonomy.test.ts` — "ranks equipment LAST for the hero" (all
  trades), "refuses equipment and credentials as hero edit sources", "THE BUG: a
  confidently vision-classified 'other' (a listing screenshot) is known-junk and never
  edited", "'unknown' is not 'known bad'" (keeps ISS-008 alive), and "picks the best WORK
  photo as hero source even when nothing is scored" — which reproduces the defect's exact
  all-unscored state. If this reverts, symptom: the hero becomes an enhanced screenshot or
  van photo again.

---

## ISS-035 — The same picture fills several slots (original + enhanced twin + hero)

- **Status:** VERIFIED — 2026-07-21, branch `fix/iss-035-dedup-image-lineage`.
- **Found:** 2026-07-21, human acceptance review of audit
  `db3aeca0-c01d-4209-84d8-cb5483b478d8`: the first two "Our work" tiles were the same
  picture twice (an image and its AI-Enhanced variant, side by side, each with its own
  badge), and the page hero was that same content a third time.
- **Root cause (FACT, measured on that audit's stored `preview_json`):** the six filled
  slots held only **three** distinct pieces of content —
  `hero=091a245e`, `gallery=[298d5b76, 091a245e, 6e06486f, 06fbdd21]`,
  `about_team=298d5b76`. `091a245e` (hero) and `6e06486f` are two enhanced derivatives of
  the SAME source `98b43ec9` (the hero_image edit and the image_fixes edit both picked it),
  and `298d5b76` appears in both the about slot and the gallery.
  Composition had no notion of content identity:
  - `applyOneSourceOneTreatment` (ISS-019) only guards "a source shown raw AND enhanced".
    It has no rule for TWO enhanced derivatives of one source, which is what happened here.
  - Slot selection and gallery selection ran independently, so the same asset could fill a
    slot and a tile.
  - Enhanced images carried `source_asset_id` but no category, so FEA-114 treated them as
    unclassified generated output — quota-exempt, hence both twins were admitted.
- **Severity:** high (judge-visible) — repetition is the most visible sign of an unedited,
  auto-generated page, which is the opposite of the product's claim.
- **Fix method:**
  - **Lineage as content identity.** `lineageRootOf(asset)` = its `source_asset_id` when it
    has one, else its own id (`performImageEdit` already recorded the link). New
    `collapseLineages()` keeps only the BEST version of each piece of content, and it is
    applied to slot fallbacks as well as the gallery — otherwise the About section shows the
    raw original while the gallery shows its enhanced twin.
  - **Cross-slot exclusion.** `assemblePreview` now resolves hero and about_team first and
    passes their lineages to `selectGallery` via `exclude_lineages`, so the gallery never
    repeats what another slot already showed.
  - **Enhanced images inherit their source's category** (an edit does not change what the
    picture shows), so they compete under the normal quota instead of slipping past it as
    "unclassified".
  - **Near-duplicate defence without lineage.** New `lib/images/fingerprint.ts` computes an
    8×8 average hash with sharp (already a dependency) at classification/generation time and
    stores it on the asset; composition suppresses a candidate within 5/64 bits of an
    already-taken one. **Stated limits:** an average hash catches re-encodes, rescales and
    mild edits — NOT crops, flips or heavy recolouring. A missing or malformed fingerprint
    is never treated as a duplicate: unknown is not "the same", so the layer can only ever
    remove what it can prove.
- **Touched files:** `lib/images/fingerprint.ts` (new), `lib/images/taxonomy.ts`,
  `lib/improve/preview.ts`, `lib/improve/image.ts`, `lib/pipeline/orchestrator.ts`,
  `tests/taxonomy.test.ts`, `tests/improve.test.ts`, `docs/ISSUES.md`.
- **Verification (real data — the exact audit that failed):** re-assembled that audit's
  preview with the fix. **Before:** 6 filled slots / 3 distinct lineages (`091a245e` twice,
  `298d5b76` twice, plus its lineage twin `6e06486f`). **After:** 3 filled slots / **3
  distinct lineages**, hero content absent from the gallery
  (`hero lineage in gallery? false`). Gates green: `tsc --noEmit`, `vitest run` (465),
  `next build`.
  *Honest scope note:* this replay re-composes the assets that failing run already
  produced, so the hero there is still the enhanced screenshot — preventing that CHOICE is
  ISS-034's fix, which applies to new runs.
- **Regression guard:** `tests/taxonomy.test.ts` — "THE BUG: an original and its AI-enhanced
  twin never take two tiles", "content already used by the hero never reappears in the
  gallery — including via an edited variant", `collapseLineages` keeps one best per content,
  plus the fingerprint suite (suppresses a re-encoded copy, keeps genuinely different
  pictures, never treats missing/malformed as duplicate, exact symmetric distances). The
  'all' flow test additionally pins that when hero_image and image_fixes edit the audit's
  single original, exactly ONE image of that lineage reaches the page.

---

## ISS-037 — The After template has no render-side defence against long text

- **Status:** FIXED — 2026-07-22, branch `fix/iss-037-card-visual-guardrails`.
- **Found:** 2026-07-21/22, alongside backend ISS-036 (which caps these strings at source).
  This entry is the renderer's own guarantee: source limits are a data decision and can move,
  the layout must hold regardless of what reaches it.
- **Symptom:** the "What we do / Services" row was wrecked by one long service — the middle
  card ran to dozens of lines and set the height for all three.
- **Root cause (FACT), two distinct problems:**
  1. **No clamping anywhere in the After template.** Every text slot rendered its full
     string: service title/description, hero statement + subline, the About paragraph, the
     contact heading, trust-bar chips, the footer legal lines.
  2. **The grids were keyed to the VIEWPORT, not the pane.** `sm:grid-cols-3` fires at a
     640px *window*, but in `SplitView` the After pane is ~50% of it. At a 800px window the
     pane is ~400px, so three ~130px columns were forced into it and every word shredded
     ("Komple ttsani…"). This is why the row looked broken even with sane content.
- **Severity:** medium-high — judge-visible on the demo's payoff page.
- **Fix method (`components/**` only, no `lib/**`):**
  - Service cards: `line-clamp-2` title / `line-clamp-5` body, `items-stretch` + `h-full`
    so the three cards are the same height, `[overflow-wrap:break-word]` throughout. Applied
    identically on the home page and `ServicesSubpage`.
  - Every other model-written slot clamped: hero statement `line-clamp-3`, subline
    `line-clamp-4`, About `line-clamp-[10]`, contact heading `line-clamp-3`, footer brand
    `line-clamp-2`, legal lines `line-clamp-3`, trust chips `truncate`. The hero wordmark
    gets `line-clamp-3` too.
  - Grids switched to **container queries** — `@container` on the wrapper, `@md:grid-cols-3`
    / `@md:grid-cols-2` on the grid — so columns respond to the pane's own width. Below that
    they stack and stay readable.
  - **Header stacking (found during verification):** at a 420px window the pane is ~210px,
    the two nav pills consumed the row and `truncate` collapsed the brand link to zero width
    — deleting the one thing FEA-116 put there. The header now stacks below the container's
    `@xs`, so the name always has a line of its own.
  - **Container-query gotcha worth knowing:** `@container` and `@md:` must NOT sit on the
    same element — a container query never applies to the element that declares it. The
    first attempt did exactly that and silently kept one column at every width.
- **Touched files:** `components/preview/AfterPanel.tsx`,
  `components/preview/ServicesSubpage.tsx`, `docs/ISSUES.md`.
- **Verification (production build + `next start`, deliberately absurd input).** A 430-character
  German service description, a 70-character service title, a doubled paragraph for About, a
  long subline and a long contact heading were written into audit `e18fadac-…`'s
  `preview_json`, then:
  - **Wide (1400px window, pane ~700px):** three cards, `heights [263, 263, 263]` — identical
    despite one card holding the 430-char body, which clamps at 5 lines with an ellipsis; the
    70-char title clamps at 2. No horizontal overflow. (`iss-037-3up-wide`)
  - **Split pane below `@md`:** cards stack full-width and stay readable instead of being
    shredded into ~130px columns. (`iss-037-split-pane-stacked`)
  - **Narrow (420×860):** `documentElement.scrollWidth === innerWidth` (no overflow), the
    injected subline clamps to 4 lines (`scrollHeight > clientHeight` confirms real
    truncation), and the header brand is visible on its own line.
    (`iss-037-narrow-header-fixed`)
  - The injected text was removed afterwards and the page re-checked (0 occurrences).
  - Gates: `tsc --noEmit`, `vitest run` (33 files / 473 tests), `next build` — all green.
- **Regression guard:** visual/structural rather than unit — the rule is "every model-written
  slot in `components/preview/**` carries a clamp, and grids inside the After pane use
  `@container` queries, never viewport `sm:`/`md:` breakpoints". If this reverts, symptom:
  one long service sets the height of the Services row again, or the cards collapse into
  unreadable slivers inside the split view.
---

## ISS-036 — A services card printed the customer's raw homepage

- **Status:** VERIFIED — 2026-07-22, branch `fix/iss-036-bounded-card-copy`.
- **Found:** 2026-07-21, human acceptance review of the After page: the "Get in touch"
  card in "What we do" ran for dozens of lines and began with `Business type: Plumber.`,
  wrecking the layout.
- **Root cause (FACT, reproduced on three stored audits):** `buildServiceFillers` in
  `lib/improve/preview.ts` used `business.background` verbatim
  (`` `${background} — contact us…` ``). That field is not marketing copy: it is the string
  `components/input/GeneralInfoSection.tsx` composes for the FORM
  (`"Business type: <types>."`) with the business's pasted/scraped site text appended. So
  the fallback published internal scaffolding plus a whole homepage: **641 characters** on
  audits `db3aeca0` and `d7ed3393`, **788** on `bb86f910`. The same raw value fed
  `hero.subline` and the About paragraph, and a second path
  (`before_json.current_text` → "Our services" card) pasted the raw scraped services block
  the same way. Nothing anywhere bounded card copy — not the fallbacks, not the model's own
  rewrite output.
- **Severity:** high (judge-visible) — it is the most visible "this was not really
  designed" artefact on the page the whole demo builds up to.
- **Fix method:**
  - New pure module `lib/improve/cardCopy.ts`: `stripInternalScaffolding` (removes the
    `Business type: …` prefix and section labels, normalizes scraped whitespace),
    `looksLikeRawDocument` (length + ALL-CAPS heading heuristic),
    `boundText`/`boundCardTitle`/`boundCardBody` (truncate at a real sentence boundary,
    ellipsis counted inside the limit), and `usableFallbackBody` — which returns **null**
    rather than publishing an excerpt of a wall of text, so the caller falls back to its own
    honest generic line.
  - Limits: title ≤ **40**, card body ≤ **180**, hero subline ≤ **180**, About ≤ **600**.
  - Applied to EVERY path, model output included: a long rewrite is trimmed at a sentence
    boundary instead of breaking the layout. The raw `current_text` card is admitted only
    when it already reads like copy.
  - `REWRITER_SYSTEM` now states the same limits to the model ("write for a PAGE, not a
    document… marketing-grade brevity beats completeness"), so trimming is the safety net,
    not the primary mechanism.
  - **Deliberately NOT added to the zod schema.** `PreviewJson` is stored; adding `.max()`
    would make every previously-stored preview fail to parse — the exact failure mode
    ISS-031 fixed. Assembly is the only writer, so the bound is enforced there and pinned by
    tests.
- **Flaw found during verification and fixed (FACT):** the first sentence-splitter cut
  `"…bieten wir als M. Mustermann Sanitärinstallation…"` at the owner's initial, producing
  `"…bieten wir als M. Contact us to discuss…"`. `lastSentenceEnd` now skips single-letter
  initials and common German/English abbreviations (`Dr.`, `Nr.`, `u. a.`, `ca.`, `inkl.`,
  `Ltd.`, …).
- **Touched files:** `lib/improve/cardCopy.ts` (new), `lib/improve/preview.ts`,
  `lib/agents/prompts.ts`, `tests/cardCopy.test.ts` (new), `docs/ISSUES.md`.
- **Verification (real data):** re-assembled the previews of **all 19 stored audits**:
  **zero** cards over the limits and **zero** containing `Business type`. On `db3aeca0` the
  offending card goes **641 → 144 characters** and now reads as copy
  ("Heizung Lüftung Sanitär - Meisterbetrieb Als Meisterbetrieb mit langjähriger Erfahrung
  sind wir der kompetente Partner rund um Ihre Haustechnik."); on `bb86f910` the
  unsalvageable 788-character block correctly degrades to the honest generic line instead of
  a mangled excerpt. Gates green: `tsc --noEmit`, `vitest run` (489), `next build`.
- **Regression guard:** `tests/cardCopy.test.ts` — pins the ACTUAL defect string from
  `db3aeca0` ("THE BUG: the real defect text never becomes a card body"), the prefix strip,
  the limits, sentence-boundary truncation, "returns nothing rather than publishing an
  excerpt of a wall of text", and the abbreviation/initial cases found in verification. If
  this reverts, symptom: a card starts with "Business type:" and runs for dozens of lines.

---

## ISS-038 — Gallery still showed one image after FEA-117

- **Status:** VERIFIED — 2026-07-22, branch `fix/iss-038-gallery-min-not-met`.
- **Found:** 2026-07-22, human re-ran the audit on what was believed to be the latest code:
  ISS-036's bounded copy was visible, but "Our work" still held a single (storefront) tile.
- **Diagnosis (FACT — audit `7a395962-41aa-4134-9a76-a15ebe686c9b`, 2026-07-21T22:44:24Z).**
  Two independent findings; only the first explains the screenshot.
  1. **The run executed code from before FEA-117.** Its progress log contains the three
     channel plans and nothing else — **no `gallery plan` line, no `gallery_filler_*`
     event** — and a query across the WHOLE database returns **0 assets carrying
     `gallery_filler`**. Replaying the planner against that same audit's real rows on
     today's `main` plans **3 fillers**, so the logic was never the problem. FEA-117 merged
     at 22:12:40Z, 31 minutes before the run — but `pnpm demo` / `pnpm demo:live` do
     `next build` *then* `next start`, i.e. they serve a SNAPSHOT: a server started before
     the merge keeps serving the old bundle no matter what `main` says. Candidates (a)–(e)
     from the brief are all ruled out by that same log: the run WAS a full "Do It For You"
     (four image channels), no generation failed (38.8s / 52.6s / 54.6s, zero
     `generation_error`), and nothing was still in flight at the end.
  2. **The subject pool was garbage anyway.** The services derived for that audit were
     `"Küchenentlüftungen     BAD"`,
     `"SANITÄRINSTALLATIONEN  Sanitärinstallationen im Alt"`,
     `"SANITÄRINSTALLATIONENSanitärinstallationen im Alt"` and
     `"Erneuerung Ihrer Heizungsanlage LÜFTUNGSTECHNIKInstallation von Bad"` — collapsed
     navigation menu text. FEA-117 would have fed these into image prompts as "the subject"
     and, once exhausted, stopped filling. So the next correct run would have produced four
     images with three nonsense briefs.
- **Severity:** high (judge-visible) — the payoff page looked unfinished.
- **Fix method:**
  - **New `lib/images/subjects.ts`.** `isUsableSubject` rejects scraped debris (collapsed
    whitespace runs, shouted 3+-capital tokens, glued words like `…ENSanitär…`, phrases cut
    off mid-thought, absurd lengths). `pickFillerSubjects` then draws from the business's
    own USABLE service names first and a **curated per-trade library** second — real work
    scenes (installed bathroom, soldered copper joints, pipe wrench and fittings, water
    heater, drain machine, stocked van…) for all six trades. Per the human's 2026-07-22
    decision, a filler no longer has to name a real service; it has to be relevant and
    DIFFERENT. The gallery therefore always reaches its minimum, while lineage and
    fingerprint dedup keep repeats out.
  - **`planGalleryFillers`** uses it and no longer stops early when service names run out.
  - **Detectability (the real lesson).** A full run now ALWAYS records
    `gallery plan: N fillers queued to reach the minimum`, even when N is 0. The absence of
    that line in a run's own evidence is now proof the server is running stale code — which
    is exactly what took a database query to establish this time.
- **Operational note for the demo:** after merging anything, restart the app —
  `pnpm demo` / `pnpm demo:live` rebuild on start, `pnpm dev` recompiles, but a server left
  running from before a merge serves the old bundle.
- **Touched files:** `lib/images/subjects.ts` (new), `lib/improve/image.ts`,
  `lib/improve/orchestrate.ts`, `tests/subjects.test.ts` (new), `docs/ISSUES.md`.
- **Verification (LIVE end-to-end, gpt-image-2, `https://www.muster-sanitaer.example/`):** analyze
  22.1s, improve complete 79.5s. Planner: `gallery plan: 3 fillers queued`, then
  `craft_detail "close-up of soldered copper pipe joints"`, `equipment "a pipe wrench and
  fitting tools laid out on a work surface"`, `work_result "a freshly installed bathroom
  with new fittings"` — all from the curated library, since every derived service name was
  correctly rejected. Final gallery: **4 tiles / 4 distinct lineages / 4 distinct
  category:subject pairs / minimum fingerprint distance 25** (near-duplicate threshold is
  5), plus hero `work_result` and about `team` filled separately. Fillers landed in
  46.8s / 47.1s / 54.0s. Gates green: `tsc --noEmit`, `vitest run` (497), `next build`.
- **Regression guard:** `tests/subjects.test.ts` — "THE BUG: rejects the real scraped debris
  that reached the image prompts" (the four actual strings from `7a395962`), keeps
  human-sounding service names, and "THE FIX: always finds enough distinct subjects, even
  with zero usable services" (4 distinct for every trade), plus no-repeat and
  prefer-unclaimed-category cases. If this reverts, symptom: the gallery falls back to one
  or two tiles, or a generated image is briefed with menu text.

---

## ISS-039 — Generated images are collages, not single photographs

- **Status:** VERIFIED — 2026-07-22, branch `fix/iss-039-single-scene-prompts`.
- **Found:** 2026-07-22, human screenshot of a real run (audit `c225b4a8`): the generated
  "storefront" image is a **collage** — two people beside a service van, a boiler room, and
  a bathroom stitched into one frame with hard dividing edges. The requirement is one
  single photographic scene per image, four independent images side by side in the gallery.
- **Root cause (FACT — read off the prompts that produced those images).** Nothing in the
  pipeline ever said "one scene", and three wordings actively invited a multi-panel frame:
  1. `buildImageGenPrompt` ended every subject-anchored shot with *"must be visually
     DISTINCT from the other images in this set — a different room, service, angle and
     composition"*. That tells the model a SET exists and asks it to differentiate inside
     one output — the exact recipe for a grid.
  2. `VARIANT_DIRECTION.storefront` listed three alternatives in one sentence — *"the
     business's own entrance, workshop or branded vehicle"* — which the model read as a
     shopping list and rendered as three panels (van / boiler room / bathroom).
  3. The grounding sentence *"This business actually offers: A, B, C. Ground every visual
     detail in these real services"* is a bare enumeration attached to an instruction to
     depict them, so several services landed in the same frame.
  There was also **no verification**: FEA-114's vision classifier only ever looks at the
  business's OWN photos, so nothing in the run could observe what we generated.
- **Severity:** high (judge-visible) — a collage is instantly recognizable as AI slop and
  destroys the "professional photo" claim the After page makes.
- **Fix method:**
  - **`SINGLE_SCENE_RULE` (new, `lib/agents/prompts.ts`)** — a hard constraint appended to
    EVERY generation prompt (`buildImageGenPrompt`, both the composed and the template
    fallback path) and to both edit prompts (`buildHeroEditPrompt`, the
    `enhanceBestExistingImage` default). It names every collage shape explicitly — collage,
    grid, split-frame, multi-panel, diptych, triptych, montage, storyboard, side-by-side,
    before/after, insets, borders — because image models treat these as separate concepts
    and forbidding only "collage" leaves the others open.
  - **The three inducing wordings are rewritten.** The distinctness clause now describes
    only THIS frame (`Build this single frame entirely around "<subject>": one room, one
    moment, one camera position`) and never mentions other images — cross-image variety is
    already enforced structurally by FEA-117/ISS-038's per-shot category+subject planning,
    not by prompt text. The storefront direction picks *"exactly one location — either the
    entrance or its branded vehicle, never both"*. The service list is reframed as
    *"Background context only, not things to depict together … do not show several services
    in the same frame"*, keeping the ISS-016 grounding intact.
  - **Collage detection (new, `lib/images/collage.ts`).** One small structured vision call
    (`OPENAI_MODEL_VISION`, the model already used for classification) per FINAL generated
    frame answers `{is_collage, reason}`. On a positive verdict the slot is regenerated
    **exactly once** with the same prompt plus one corrective sentence
    (`COLLAGE_CORRECTION`); the second frame is re-checked for the record. Cost is bounded:
    ~4-8 cheap vision calls per full run, at most one extra image per slot.
    Non-negotiables baked in: it **fails open** (any error, malformed verdict, or 60s
    timeout ⇒ "not a collage"), so verification can never lose an image already paid for or
    fail a run; a failed retry **keeps** the first image rather than leaving the channel
    empty; and everything observed is recorded on the asset's `meta_json`
    (`collage_detected`, `collage_retry: recovered | still_collage | retry_failed`).
    Kill switch: `IMAGE_COLLAGE_CHECK=0`.
  - **Deliberately NOT changed:** the human-facing shot briefs in `lib/improve/image.ts`
    (`WORK_PROOF_SHOT_LISTS`' 10-shot list) enumerate several shots on purpose — they are
    advice printed for the business owner and are never sent to the image model.
- **Touched files:** `lib/agents/prompts.ts`, `lib/images/collage.ts` (new),
  `lib/improve/image.ts`, `tests/collage.test.ts` (new), `tests/improve.test.ts`,
  `docs/ISSUES.md`.
- **Verification (LIVE end-to-end, gpt-image-2, `https://www.muster-sanitaer.example/`, audit
  `42479dbd-eeac-4429-a546-d6adc71792da`):** analyze 33s, improve complete 62s.
  `gallery plan: 3 fillers queued to reach the minimum`; composition
  `hero=work_result, about_team=team, gallery_0=work_result, gallery_1=craft_detail,
  gallery_2=storefront, gallery_3=equipment`. **`preview_json.gallery` holds 4 independent
  entries**, four distinct categories and four distinct subjects:
  work_result "a freshly installed bathroom with new fittings" / craft_detail "close-up of
  soldered copper pipe joints" / storefront (channel `work_proof_images`, redirected) /
  equipment "a pipe wrench and fitting tools laid out on a work surface".
  **Every one of the five generated images was opened and inspected: all are single
  scenes, zero collages** — the courtyard workshop entrance, the finished bathroom, the
  soldered copper joint macro, the tool flat-lay, and the two-person boiler-room portrait.
  The three scenes that the defect crammed into ONE frame are now three separate images.
  Prompt evidence on the asset: contains `ONE single photographic scene only`, contains no
  `in this set` / `other images` wording. No collage was detected in the run, so no image
  cost a retry (`collage_detected` absent on all five).
- **Detector proof (it is not silently failing open):** `detectCollage` run directly
  against the reported defect image (`c225b4a8/work_proof_images.png`) returns
  `is_collage: true — "The image combines a top van scene with two distinct bottom scenes
  separated by hard horizontal and vertical boundaries."`, and against the new run's
  storefront image returns `is_collage: false — "This is one continuous photograph of a
  building exterior with an open garage and visible interior."`
- **Gates:** `pnpm exec tsc --noEmit`, `pnpm exec vitest run` (513 tests, 36 files),
  `pnpm build` — all green.
- **Regression guard:** `tests/collage.test.ts` — the rule is present on every trade ×
  variant (with and without business context) and on the edit prompt; "THE BUG" cases pin
  that the three inducing wordings are gone (`in this set`, `entrance, workshop or branded
  vehicle`, `This business actually offers:`); `detectCollage` fails open on a broken call,
  a malformed verdict, and under the kill switch; and `generateChannelImage` regenerates a
  detected collage exactly once, on the same prompt plus the correction, recording the
  outcome — while a clean frame still costs exactly one generation. If this reverts,
  symptom: generated gallery tiles show several scenes in one frame again.

---

## ISS-040 — The one-click button rebuilt the page with gallery fillers switched off

- **Status:** VERIFIED — 2026-07-22, branch `fix/iss-040-one-click-full-run`.
- **Found:** 2026-07-22 — the user's gallery still showed ONE tile while the backend
  end-to-end proof for ISS-039 showed four. Two paths, two behaviours.
- **Root cause (FACT — audit `ea00d161-7ef1-4806-8fec-445dc01406a5`, 2026-07-21T23:50Z).**
  An integration defect between FEA-111 (the button) and FEA-117 (gallery fillers), not a
  planner bug. The button does NOT post `{channels: "all"}`: `ActionStrip` posts
  `selectImprovableIds(channels)` — an explicit ARRAY of every todo channel, which
  includes `optimized_site`. The orchestrator answered two different questions from two
  different expressions: `wantsPreviewAssembly(selection)` (true for that array, because it
  contains `optimized_site`) decided whether to rebuild the page, while
  `selection === "all"` (FALSE for that array) decided whether to fill the gallery. So the
  real user path rebuilt the whole After page **and** skipped the fillers. The audit's own
  log proves it exactly: post-FEA-117 planning language is present, `optimized_site` ends
  `improved` (so assembly ran), there is **no `gallery plan:` line** and no filler, and the
  composition line reads `gallery_0=storefront` — one tile. It is also a single request,
  not a per-channel loop: only one `rewriting_text` event exists.
- **Severity:** high (judge-visible) — the payoff page looked unfinished for every real
  user, and the defect was invisible to any test or proof that used `"all"`.
- **Fix method:** collapse the two expressions into ONE predicate, `isFullPageRun`, and
  pass one `fullPageRun` flag into `runLiveImprove`. This is the honest definition rather
  than a patch: the After gallery is (re)built exactly when preview assembly runs, so
  "the gallery must not look empty" applies exactly then. A single-channel "Improve It"
  posts `[channel.id]` with no `optimized_site`, so it still assembles nothing and
  generates nothing extra — the FEA-117 cost constraint is preserved by construction. No
  API-shape change and no frontend change were needed, so nothing else can drift out of
  step with the button.
- **Touched files:** `lib/improve/orchestrate.ts`, `tests/oneClickFullRun.test.ts` (new),
  `tests/improve.test.ts` (the FEA-112 partial-frame case now uses a genuinely
  single-channel selection), `docs/ISSUES.md`.
- **Verification (LIVE end-to-end through the USER path, audit
  `875ae19e-0285-4d03-8a07-70506e8e4abf`, `https://www.muster-sanitaer.example/`):** the improve
  request was built exactly as `ActionStrip` builds it — the array
  `["optimized_site","image_fixes","cta_contact","services_copy","work_proof_images",
  "business_description","hero_image","team_image"]`, i.e. every todo channel except
  `promo_video`, NOT `"all"`. Analyze 35s, improve complete 69s. The run now records
  `gallery plan: 3 fillers queued to reach the minimum` followed by the three filler plans,
  and closes with `composition: hero=work_result, about_team=team, gallery_0=work_result,
  gallery_1=craft_detail, gallery_2=storefront, gallery_3=equipment`. **`preview_json.gallery`
  holds 4 independent entries** with four distinct categories and subjects. Same request
  shape as the reported defect run, opposite outcome.
  (Honest scope note: the request was posted with the shape the button produces, derived
  from the live channel list by the UI's own selector rule; no browser automation was
  available in this session to press the button itself. `tests/oneClickFullRun.test.ts`
  builds that array by CALLING `selectImprovableIds`, so the shape is pinned in code.)
- **Regression guard:** `tests/oneClickFullRun.test.ts` drives the request the UI actually
  builds, from the UI's own `selectImprovableIds`: "THE BUG" pins that the posted value is
  an array containing `optimized_site` (never `"all"`); "THE FIX" pins that this exact
  array plans and generates the fillers and rebuilds the page; a single-channel selection
  still produces no `gallery plan:` event and exactly one image; and the literal `"all"`
  API path keeps working. If this reverts, symptom: the button's runs have no
  `gallery plan:` line and the gallery falls back to one tile.

---

## ISS-041 — The storefront shot has no trade in it

- **Status:** VERIFIED — 2026-07-22, branch `fix/iss-041-storefront-prompt-grounding`.
- **Found:** 2026-07-22, human screenshot of audit `ea00d161-7ef1-4806-8fec-445dc01406a5`
  (a Berlin plumber): the `work_proof_images` channel, redirected to the missing
  `storefront` category, generated a photorealistic **anonymous residential entrance** —
  a grey front door, a shrub in a planter, paving. Nothing about it says plumber; it could
  illustrate any address in Germany.
- **Root cause (FACT — the prompt that produced it).** The premises brief carried no trade
  content at all. Subject line: *"Show the premises or branded vehicle of MUSTER + SOHN
  GmbH — the place a local customer would actually arrive at — tidy, welcoming and
  unmistakably in business."* Direction: *"…photographed from a flattering three-quarter
  angle in soft daylight, tidy and welcoming."* Neither names one object a plumber owns.
  Worse, the only cue the wording did offer — "branded vehicle" — is unusable by
  construction: the no-text rule forbids signage and logos (and inventing branding would
  be a lie), so **the trade can only be shown through the trade's own objects**, and none
  were requested. The model filled the vacuum with the most generic "premises" it knows.
- **Severity:** medium-high (judge-visible) — the gallery tile occupies a payoff slot and
  communicates nothing about the business.
- **Fix method:**
  - **`STOREFRONT_TRADE_CUES` (new, `lib/agents/prompts.ts`)** — per-trade lists of the
    concrete objects that make a premises shot recognizable: pipe lengths/fittings/tool
    cases (plumber), cable drums/conduit/test gear (electrician), tiles/battens/ladders
    (roofing), toolboxes/timber/step ladder (handyman), a street-level practice entrance
    with reception visible (doctor, deliberately non-clinical), and the business's own
    equipment/stock/vehicle (other, trade-neutral).
  - **The storefront subject line is rewritten around them**, on BOTH paths — with a
    concrete filler subject ("…as the working base of <brand>, with <cues> clearly
    visible") and without one ("Show where <brand> actually works from … so the picture
    could only belong to a <trade> and never to an anonymous house or office").
  - **`VARIANT_DIRECTION.storefront`** now states what the frame must prove and rules the
    defect out by name: *"Never an anonymous residential front door, apartment entrance,
    or generic office building with nothing of the trade visible."* The ISS-039
    single-scene constraint ("exactly one location … never both") is preserved.
  - **`lib/images/subjects.ts`** — the four trade-identical `"the inside of a fully stocked
    service van"` entries are now trade-specific (copper pipe and fittings / cable drums
    and test gear / roof tiles and ladders / toolboxes and timber), and `other`'s
    content-free `"the business premises, tidy and welcoming"` now requires equipment and
    stock in view.
- **Touched files:** `lib/agents/prompts.ts`, `lib/images/subjects.ts`,
  `tests/storefrontGrounding.test.ts` (new), `docs/ISSUES.md`.
- **Verification (controlled LIVE generation, gpt-image-2, same business):** one storefront
  call with the new prompt returned **a plumber's work van, side door open, racked copper
  pipe and brass fittings, tool cases, a plumber in workwear handling a pipe, on a Berlin
  street** — unmistakably this trade's working base, and a single scene
  (`detectCollage → is_collage: false`). Gates green: `tsc --noEmit`, `vitest run` (515),
  `next build`.
- **Verification (same LIVE user-path run, audit `875ae19e`):** the `storefront` tile is
  now **a plumber's work van, side door open, racked copper pipe and brass fittings, tool
  cases and a tool bag, parked in the workshop** — unmistakably a plumber's working base,
  and nothing like the anonymous front door it replaced. All six generated images of that
  run were opened and inspected: hero (plumber fitting a basin trap with the customer
  watching), team (owner in the boiler room), and the four gallery tiles (finished
  bathroom, soldered copper joint macro, van interior, pipe wrench and fittings) — every
  one a single scene, every one recognizably this trade.
- **Regression guard:** `tests/storefrontGrounding.test.ts` — "THE BUG" pins that the two
  content-free wordings are gone; "THE FIX" pins that every trade's storefront prompt names
  that trade's own equipment; the anonymous-house exclusion and the ISS-039 rule are pinned
  together; the subject-anchored filler path is covered; and the subject library is checked
  for content-free storefront entries. If this reverts, symptom: premises tiles become
  generic doors and buildings again.
