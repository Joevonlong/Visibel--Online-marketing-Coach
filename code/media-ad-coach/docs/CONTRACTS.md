# Module interface cards

Compiled by Mission Control from each builder's handoff report. These are the shapes you
build AGAINST — read the source file for full detail, but do not change another lane's
surface without coordination. Frozen vocabulary lives in `lib/schemas.ts` (zod 4).

## lib/db.ts (SQLite, better-sqlite3)

- `getDb()` lazy singleton — `storage/app.db` (override `APP_DB_PATH`), WAL, auto-creates
  4 tables (`audits`, `assets`, `channels`, `progress_events`); `closeDb()` for tests.
- Audits: `createAudit({business_json, status?="draft", execution_mode?="LIVE"})`,
  `getAudit(id)`, `listAudits()` (created_at DESC, rowid DESC), `updateAudit(id, patch)`
  (partial: status/execution_mode/evidence_json/report_json/preview_json/overall_score).
- Assets: `insertAsset({audit_id, kind, source?, storage_path?, meta_json?, score_json?,
  label?, status?="pending"})`, `getAsset(id)`, `listAssets(auditId)`, `updateAsset(id, patch)`.
  `label`: `null | 'ai_concept' | 'enhanced'` (truth badges).
- Channels (PK audit_id+id): `replaceChannels(auditId, rows)` (transactional full replace,
  preserves given order; rows include `one_liner?` default ""), `listChannels(auditId)`,
  `updateChannelStatus(auditId, channelId, status, afterJson?)` (leaves one_liner alone).
- Progress: `addProgressEvent(auditId, step, detail?)`, `listProgressEvents(auditId)` (chronological).
- JSON columns: pass objects, helpers stringify/parse. db.ts imports NOTHING from schemas.

## lib/pipeline/* (evidence)

- `tavily.ts`: `checkFindability(trade, city|undefined, brandName) → TavilyFindability`
  (never throws; no key/API error → status "error", empty results). `tavilyExtract(url) →
  {raw_content} | null`. Pure helpers: `classifyFindability`, `extractDomain`.
- `website.ts`: `fetchWebsiteEvidence(url) → WebsiteEvidence | null` — fetch (10s, Chrome UA)
  → cheerio → if failed or text <200 chars → Tavily Extract fallback (source:"tavily") →
  both fail → null. `fetchPortalEvidence(url, platform) → PortalEvidence | null` same ladder.
  `detectPlatform(url)`. Pure extractors exported for tests.
- `images.ts`: `harvestImages(auditId, candidates, baseUrl) → {assets, skipped_count}` —
  filter (svg/icons/<200px/dupes) → download top-8 by bytes → sharp 1024px JPEG q80 →
  `${storage}/images/<auditId>/img-N.jpg` + assets rows (kind harvested_image, status
  "normalized"). `ingestUploadedImage(auditId, buffer, filename) → AssetRecord` (creates a
  NEW normalized row — raw uploads from the assets route stay status "uploaded").
  `prepareImagesForVision(auditId) → {asset_id, storage_path, base64_data_url}[]` (≤8
  harvested + all uploaded, normalized only). Storage root honors `APP_STORAGE_DIR`.

## lib/agents/* (GPT-5.6 Luna experts)

- `openai.ts`: `structuredCall<T>({schema, schemaName, system, user, model?, maxTokens?,
  stage?, client?}) → T` — Structured Outputs via `zodResponseFormat` (zod-v4-compatible;
  per-channel schemas only, never a union root). Exactly 1 retry (validation/parse/429/5xx),
  then throws `AgentCallError{provider, stage, cause}`. No key → immediate AgentCallError.
  `getModels() → {text, vision, image}` from env with gpt-5.6-luna/gpt-image-2 defaults.
- `experts.ts`:
  - `runCopyStrategist({textEvidence: {source,label,text}[], trade, city?, findability}) →
    CopyStrategistOutput` — zero evidence → deterministic all-absent output, NO model call.
    Tag each evidence block's `source` with fetched/tavily/manual/screenshot — it passes
    straight into Criterion.source.
  - `runVisualDirector({images: {asset_id, data_url, alt?}[], trade}) → VisualDirectorOutput`
    — auto-batches >8 images; coverage_gaps = intersection across batches; zero images →
    deterministic all-gaps output, no call.
  - `runSynthesizer({report: Omit<Report,"executive_summary"|"memory_note">, memoryHits:
    {count, weakest_lane} | null}) → SynthesizerOutput` — memory_note is built
    DETERMINISTICALLY in code from memoryHits (model's attempt is discarded); model can
    never alter numbers.
  - `runGbpExtraction({screenshots: dataUrl[]}) → GbpExtractionOutput` (zero → all-null, no call).
- `prompts.ts`: `COPY_STRATEGIST_SYSTEM`, `VISUAL_DIRECTOR_SYSTEM`, `SYNTHESIZER_SYSTEM`,
  `REWRITER_SYSTEM(channel, trade, city?)`, `GBP_EXTRACTION_SYSTEM`,
  `IMAGE_GEN_TEMPLATES[trade][hero|team|work_proof]` (all "no text, no logos"), doctor
  compliance instruction baked in.

## lib/rubric.ts (deterministic engine — the ONLY source of numbers)

- `buildReport(input) → Omit<Report, "executive_summary"|"memory_note">` where input =
  `{business, websiteEvidence|null, portals[], gbp|null, findability, copyOutput|null,
  visualOutput|null, assets[], executionMode, disclaimers?}`. Call once, then layer
  Synthesizer text on top. Validates against frozen Report schema.
- Criterion→channel mapping (documented in-file): T1→hero_headline · T2/T5→cta_contact ·
  T3/T6→business_description · T4/T7→services_copy · T8→legal_footer ·
  NAP→platform_consistency · I3→work_proof_images · I1/I2/I4/I5/I6 + red flags +
  branding-gap→image_fixes · hero-gap→hero_image · team-gap→team_image.
- Pinning: optimized_site always first, promo_video always last (coming_soon); middle by
  priority = impact²/effort desc, alphabetical tie-break. Constants exported
  (`TEXT_CRITERIA`, `IMAGE_CRITERIA`, `BANDS`, `CHANNEL_CATALOG`).
- Website unreachable / zero text → absence scoring with the exact finding "site
  unreachable — that is what your customer sees too."

## API endpoints (app/api/audits/*)

- `POST /api/audits` — BusinessInput + optional `has_attachments:true` (create-time-only
  escape hatch; real gate re-checked at analyze). 201 `{auditId}` / 400 `{error}`.
  execution_mode from `DEMO_MODE=replay` env.
- `GET /api/audits` — `[{id, created_at, brand_name, trade, overall_score, status,
  execution_mode}]` newest first.
- `POST /api/audits/:id/assets` — multipart `files` (≤10, jpeg/png/webp, ≤10MB) + `kind`
  (uploaded_image|gbp_screenshot). 201 `{assetIds[]}`. Raw files →
  `${storage}/uploads/<auditId>/`, rows status "uploaded".
- `POST /api/audits/:id/analyze` — 202 `{status:"analyzing"}` (status flips before
  response); 409 if analyzing/improving; 400 if nothing to analyze. Fire-and-forgets
  `runAnalyzePipeline(auditId)` from `lib/pipeline/orchestrator.ts`; rejection → status
  "failed" + honest progress event (step "failed" — not in the enum; treat status as
  authoritative, ignore unknown steps).
- `GET /api/audits/:id` — `{status, execution_mode, progress[], report|null,
  channels|null, preview_ready, overall_score}` — canonical JSON state. The client
  refreshes it on SSE events and uses 1s/5s polling only as a compatibility fallback.
- `GET /api/audits/:id/events` — `text/event-stream` with `snapshot`, ordered
  `progress`, heartbeat comments, and final `complete`/`error` events. One connection
  intentionally stays open across analyze `scored` so it can carry the following
  improve run; it closes only at `complete` or `failed`.
- `GET /api/audits/:id/report` — downloadable `application/pdf` generated from the
  persisted, schema-valid report. 409 before scoring; 503 if the local Chromium renderer
  is unavailable. The on-screen report remains the honest fallback.
- `POST /api/audits/:id/improve` — implemented (F-045); full contract in the
  "Improve engine" section below. Create route also accepts `mode?: "replay"`
  (per-audit REPLAY override, wins over DEMO_MODE env).

## Design system (frontend lane)

- Tokens (globals.css @theme): `bg-surface` `bg-surface-alt` `text-ink` `text-ink-secondary`
  `bg-accent/text-accent` `bg-success` `border-hairline`; type: `text-display` (clamp
  56–72px), `text-section-title` (40px), `text-body` (17px/1.5). Light-only. Global
  prefers-reduced-motion kill-switch in CSS.
- Primitives (components/primitives): `PillButton{variant primary|quiet|success, size,
  loading, href?}` · `Card{variant filled|outlined}` · `Section{alt, eyebrow, title,
  titleAs, description}` · `Nav{wordmark, children}` · `Badge{variant
  live|replay|ai_concept|enhanced|neutral, overlay}` (overlay = absolute corner badge on a
  relative img wrapper) · `SeverityDot{severity, label?}` · `CriterionBar{label, score,
  weight}` · `FadeRise{delay, y, once}` (only "use client" one).

## Improve engine (backend wave 2) — what the frontend renders

- `POST /api/audits/:id/improve` body `{channels: string[] | "all"}` → 202
  `{status:"improving"}`; 409 unless status scored|complete; 400 for empty array, unknown
  id, `promo_video`, or a channel not on this audit. Poll GET /:id for flips.
- Channel `after_json` shapes (render inline reveals from these):
  - Text channels: the FULL `RewriteOutput` — `{channel_id, before_excerpt, after:{...},
    rationale_one_liner}`; unwrap `.after` for the channel-specific fields.
  - hero_image / team_image / work_proof_images: `{shot_brief, best_existing_asset_id,
    generated_asset_id, generation_error}` — show `generated_asset_id ??
    best_existing_asset_id`; the asset row's `label` field is authoritative for the
    `AI concept` badge.
  - image_fixes: `{shot_brief, fixes: [{asset_id, instruction}], source_asset_id,
    enhanced_asset_id, edit_error}`. The original asset is always retained.
  - optimized_site: after_json stays null; content lives in `audits.preview_json`
    (PreviewJson schema), flips improved when preview assembles.
- "all" completion → audit status `complete` + preview_json persisted. Single-channel
  improve → back to `scored` (no preview) unless one already exists.
- Improve progress steps: `rewriting_text → generating_images → assembling_preview → done`.
- REPLAY mode: channels flip only from fixture-recorded afters; unrecorded channels stay
  todo with an honest progress event (until F-082 records a full fixture).
- Cap: up to 3 AI concepts and 5 generated/edited outputs total per audit. `image_fixes`
  edits the best real photo via `gpt-image-2`, preserves the original, and writes
  `{source_asset_id, enhanced_asset_id, edit_error}` alongside the fix instructions.
  Edited assets use the truthful `enhanced` label; failures keep the instructions and
  original photo without faking an edit.
- Preview navigation is URL-backed: the assembled home page lives at
  `/audit/:id/preview`; `?site=services` renders the three stored service cards and
  labeled gallery without inventing a second schema or losing the LIVE/REPLAY badge.
