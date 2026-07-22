# Visibel — "From Zero to Hero" — Final Implementation Plan (v2, Narrowed)

> **v2 refactor note.** This version supersedes v1 after a deliberate scope-narrowing
> decision: the previous full-presence vision (4 pillars + video pipeline) was too large for
> the hackathon window. v2 focuses on **local business search content — text and images
> only**. Video analysis is removed entirely; video generation remains only as a visible
> "Coming soon" roadmap row. The professional scoring standards from v1 are preserved
> unchanged wherever their lane survives (text, images); their weights are re-normalized
> over the narrowed scope.
>
> Status: supporting evidence for the team build. Benchmarks are marketing heuristics
> (`ASSUMPTION`) unless marked `FACT`. Judging (`FACT`): 50% Technical Execution / 30%
> Creativity & Wow / 20% Real Problem; ≥1 partner technology load-bearing; submission =
> 2-minute video + public GitHub repo before 19:00. Partner constraints carried over from
> v1: **Tavily must be used (P0, load-bearing)**; **Cognee must be attempted, kept simple**.

---

Project name: Visibel

## 0. Product Definition

**Visibel — From Zero to Hero.**
Paste the link of any small local business (plumber, handyman, doctor…) → AI marketing
experts score the **text** and **images** that customers actually see on Google search /
Google Maps / the business website → a channel list shows everything worth improving →
one click, **we do it for you**: rewritten copy, better images, and a ready-made optimized
web page — shown as a live **Before & After**.

- **ICP** (unchanged): owner-operated local service businesses that customers find through
  local search — trades (plumbing/heating, electrical, roofing, handyman) and small
  practices (doctors, physio). Test target set for the demo: 2–3 real weak websites of a
  local plumber, a repair service, and a doctor's practice (collected before T0).
- **Ten-second takeaway**: _"It looks at your business the way a searching customer does,
  scores your words and your photos, and then — instead of giving you homework — fixes
  them for you and shows you the after."_
- **Slogan** (used on landing + pitch): **From Zero to Hero.**
- **Hero interaction — a three-page product** (team page design): **Landing** → **Input
  page** (general information + online presence links + attachments) → **Recommendation
  page** (score + channel list; click **Improve It** / **Do It For You** → the improved
  text, images, and Before/After optimized webpage reveal in place).
- **Service model shift (v2)**: the first action is never "do this yourself this week."
  It is **"Do it for you"** — the product behaves like a purchased service: the customer
  approves, we generate. Recommendations exist as evidence _behind_ each channel row, not
  as a homework list.

Partner technology map (unchanged commitments, narrowed usage):

| Partner | Role                                                                                                                                                                      | Load-bearing?                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| OpenAI  | GPT-4o vision (image scoring, screenshot extraction), GPT-4o text (scoring agents, rewriting), **gpt-image-1** (image generation for the After state), Structured Outputs | Yes — scoring and Do-It-For-You die without it |
| Tavily  | **Must use (P0).** Live findability check ("{trade} {city}" — is the business found?) + Tavily Extract when direct website fetch fails or returns a JS shell              | Yes — runs in every live audit                 |
| Cognee  | **Must attempt (P1, deliberately simple).** One add call per completed audit + one search call per new audit → one "compared to similar businesses" line                  | Light but real; non-blocking, never faked      |

---

## 1. Scope

### P0 — no demo without it

1. **Input page** in three grouped sections (6.2): **general information** (brand name,
   background/category, location), **online presence** (business website, Google Maps,
   Yellow Pages / Gelbe Seiten, Check24 or other platform pages), **attachments** (manual
   text input, image uploads, optional GBP screenshots). At least one presence link or
   attachment required.
2. **Evidence pipeline**: every presence link fetched + text-extracted (cheerio, Tavily
   Extract fallback), harvesting of up to 8 content images, GPT-4o vision scoring of
   images, GPT-4o scoring of text, cross-platform consistency comparison, Tavily
   findability check.
3. **Deterministic Rubric Engine**: models produce criterion sub-scores + quoted evidence;
   the backend computes all totals with fixed weights (model never invents a total).
4. **Recommendation page** — the star demo page, one route: score header (overall +
   Text/Image lane scores + evidence highlights) directly above the **channel list** —
   every improvable item on the left, an **Improve It** button on the right, one primary
   **Do It For You** button on top.
5. **Do It For You engine**: per-channel text rewrites (GPT-4o) + generated concept images
   (gpt-image-1, clearly labeled) + the **optimized one-page website preview** with
   Before/After view, revealed from the recommendation page (full-screen overlay route).
6. SQLite persistence + history; REPLAY fixture mode; Apple-style visual system on every
   page (section 6).

### P1 — clear bonus points

- Cognee audit memory (simple, must attempt — same contract as v1, section 6.6).
- Real "Before" screenshot via local Playwright capture (P0 uses a structured as-is panel).
- Image _editing_ of the business's real photos (gpt-image-1 edits: relight/recrop) in
  addition to generated concept images.
- SSE streaming progress (P0 polls every 1 s).

### P2 — only if everything is green

- Cognee deeper usage; PDF export; multi-page preview (services subpage).

### Explicitly removed in v2 (do not build, do not fake)

- **Video analysis** — the entire ffmpeg/Whisper/yt-dlp pipeline from v1 is deleted.
- **Video generation** — stays only as a disabled "Coming soon" channel row (roadmap).
- Activity/frequency and review-reputation **pillars** as scored components — review count
  / rating render as small context chips when GBP data is provided, but they no longer
  enter the score.
- Account scraping, CTR/revenue prediction, login, payments, deployment (localhost only).

---

## 2. Business Logic — Scoring Framework (standards preserved, scope narrowed)

Two scored lanes. Criterion anchors are carried over verbatim from v1 (professional
standards unchanged); only the lane composition changed because video left the scope.

### 2.1 Overall score

`OverallScore (0–100) = 50% Text Score + 50% Image Score`

Score bands (unchanged from v1): 85–100 Market Leader · 70–84 Strong · 50–69 At Risk ·
30–49 Weak · 0–29 Invisible. Lane score = `Σ (criterion_score / 5 × weight) × 100`.
Missing evidence scores the criterion 0 **and** creates a channel row (absence is a
verdict: "your site has no team photos" is itself the finding).

### 2.2 Text rubric (applies to all customer-visible words: website copy, GBP description, captions)

v1's copy rubric (C1–C6) merged with the text-relevant website criteria (W1/W3/W6):

| #   | Criterion                              | Weight | What 5/5 looks like (anchor unchanged from v1)                                                                                                                                                                          |
| --- | -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Value clarity / above-the-fold promise | 20%    | Trade + area + specialty answered in the first visible sentence                                                                                                                                                         |
| T2  | CTA presence & specificity             | 15%    | "Call now — we answer within 2 hours", not "learn more"                                                                                                                                                                 |
| T3  | Trust elements                         | 15%    | Meisterbetrieb / years / certifications / real guarantees                                                                                                                                                               |
| T4  | Local relevance                        | 15%    | City, region, radius, local landmarks in the copy                                                                                                                                                                       |
| T5  | Contact conversion path                | 10%    | Phone visible in header/footer text, hours listed, form ≤5 fields                                                                                                                                                       |
| T6  | Readability                            | 10%    | Short sentences, zero jargon, scannable structure                                                                                                                                                                       |
| T7  | Correctness & compliance               | 10%    | No spelling errors; red flags: "100% guaranteed", unverifiable superlatives; for doctors additionally: health-claim caution (DE Heilmittelwerbegesetz sensitivity — `ASSUMPTION`-level heuristic, flagged not lawyered) |
| T8  | Legal hygiene                          | 5%     | Impressum + Datenschutz present (mandatory in DE; missing = instant `high` finding)                                                                                                                                     |

### 2.3 Image rubric (each harvested/uploaded image — unchanged I1–I6 from v1)

| #   | Criterion              | Weight | What 5/5 looks like                                     | Typical failure the agent must name |
| --- | ---------------------- | ------ | ------------------------------------------------------- | ----------------------------------- |
| I1  | Technical quality      | 20%    | Sharp, well-exposed, ≥1080px long edge                  | Blurry night shot of a boiler       |
| I2  | Subject & authenticity | 20%    | Real team/real jobs, human faces, recognizably local    | Obvious stock photo, empty van      |
| I3  | Job-proof value        | 20%    | Before/after pairs, process shots, finished work        | Only tool close-ups, no outcomes    |
| I4  | Composition & framing  | 15%    | Clean background, deliberate framing, thumbnail-legible | Cluttered garage, tilted horizon    |
| I5  | Platform fit           | 15%    | Correct aspect, text overlay <20% of area               | Flyer screenshot used as photo      |
| I6  | Branding & trust       | 10%    | Logo/uniform/vehicle branding, consistent               | No way to tell whose work it is     |

Plus **coverage check** (drives channels, not the score): does the image set contain a
hero shot, team/person shot, work-proof shot, and branding shot? Each missing category
becomes its own channel row. Hard red flags unchanged (foreign watermark, stock-as-own,
privacy issues) — each forces a `high` finding.

### 2.4 Context signals (displayed, not scored)

- **Findability chip (Tavily, P0 must-use)**: live search "{trade} {city}" → _Found /
  Portals only / Not found_, with the actual result list as expandable evidence. Feeds the
  landing pitch ("customers can't even find you — zero") and the text agent's T4 judgment.
  If the Tavily call errors at runtime, the chip shows an honest error state and any
  derived judgment is labeled `ASSUMPTION`. Tavily is never cut from the build.
- **Reputation chips** (only when Maps link / GBP screenshots / manual numbers provided):
  review count, average rating, photo-review presence — extracted per v1 §5.2 method
  (vision on screenshots, editable pre-fills, manual > screenshot > link precedence).
- **Platform coverage chip**: which presence surfaces exist (website / Google Maps /
  Yellow Pages / Check24+), plus the cross-platform consistency verdict (3.4).

### 2.5 Findings → Channels (the action model)

1. Every criterion scoring ≤2 and every red flag becomes a **Finding**
   `{id, lane: text|image, criterion, severity, evidence_quote, asset_ref?}`.
2. Findings are grouped into **Channels** — the unit of the action page. Fixed channel
   catalog (only rows with at least one finding, or a missing-coverage gap, appear):

| Channel id             | Lane  | Row title (user-facing)              | "Improve It" produces                                                                 |
| ---------------------- | ----- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `hero_headline`        | text  | Headline & first impression          | New H1 + subline + CTA button text                                                    |
| `business_description` | text  | About / business description         | Rewritten about paragraph + GBP description (≤750 chars, DE+EN)                       |
| `services_copy`        | text  | Services descriptions                | Per-service rewrite with local keywords                                               |
| `cta_contact`          | text  | Call-to-action & contact path        | CTA copy + contact block layout text                                                  |
| `legal_footer`         | text  | Legal footer (Impressum/Datenschutz) | Checklist + footer text template                                                      |
| `platform_consistency` | text  | Name, phone & address consistency    | Corrected NAP block to use identically on website, Maps, and every portal             |
| `hero_image`           | image | Main photo                           | gpt-image-1 concept hero image (labeled) + shot brief for the real photo              |
| `work_proof_images`    | image | Work & before/after photos           | Concept images + 10-shot list tailored to trade                                       |
| `team_image`           | image | Team / owner photo                   | Concept image + shot brief                                                            |
| `image_fixes`          | image | Fix existing photos                  | Per-photo instructions (crop/relight/replace); P1: gpt-image-1 edit of the real photo |
| `optimized_site`       | site  | **Your optimized website**           | The full Before/After one-page preview (assembled from all improved channels)         |
| `promo_video`          | video | Promo video                          | **Coming soon** — disabled row, roadmap tooltip                                       |

3. Rows are ordered by `priority = impact² / effort` (impact/effort set per finding by the
   rubric engine, same math as v1). `optimized_site` is always pinned first and carries the
   primary **Do It For You** action; `promo_video` is always pinned last, disabled.

---

## 3. Evidence Acquisition (no video, no ffmpeg)

### 3.1 Website (primary input)

Server-side `fetch`, 10 s timeout → `cheerio` → `WebsiteEvidence`:
`{ https, title, h1, meta_description, has_viewport_meta, tel_links[], visible_text
(first ~8k chars, section-tagged: hero/about/services/footer), nav_links[], has_impressum,
has_datenschutz, img_candidates[{src, alt, natural_size?}] }`.
**Fallback (P0, must-use partner): Tavily Extract** when fetch is blocked, empty, or a
JS-only shell. Both fail → criteria score from absence; finding: "site unreachable — that
is what your customer sees too."

### 3.2 Image harvesting

From `img_candidates`: filter icons/logos (<200px, svg, sprite paths), dedupe, download
the **8 largest content images** to `storage/images/<auditId>/`, normalize with `sharp`
(1024px long edge, JPEG q80). These plus any manual uploads are the scored image set.
Zero usable images → that itself is the top image finding.

### 3.3 Google Maps input

A Maps URL is accepted in its own input field. P0 handling: Tavily search on the place
name for corroborating public data + prompt for GBP screenshots (vision-extracted, fields
editable) — identical method and precedence rules as v1 §5.2. No official Places API
dependency for the demo.

### 3.4 Directory & portal pages (Yellow Pages / Gelbe Seiten, Check24, others)

Every provided portal URL goes through the same fetch → cheerio → Tavily Extract fallback
path into a source-tagged evidence block `{platform, url, visible_text, brand_name?,
phone?, address?}`. Three uses:

1. **More customer-visible words to score** — a thin or outdated Check24/Gelbe Seiten
   description is a real text finding with a quote, exactly like website copy.
2. **Cross-platform consistency check** (deterministic, in `rubric.ts`): brand name,
   phone, and address are normalized and compared across website / Maps / portals; any
   contradiction creates a `high` finding and the `platform_consistency` channel row.
3. **Platform coverage chip** on the recommendation page (2.4).

Portal pages are read-only evidence — we never post to or modify them.

---

## 4. "Do It For You" Engine (the wow)

### 4.1 Interaction contract

- Top of the action page: primary button **`Do It For You`** → runs every improvable
  channel, then routes to the Before/After preview. Framed as the purchased service:
  _"You approve. We do the work."_
- Each row: secondary button **`Improve It`** → improves only that channel; the row flips
  to `improved` state with an inline before → after reveal.
- Both call the same endpoint (`improve` with one channel id or `all`).

### 4.2 Text improvements

One GPT-4o structured call per text channel (parallel, ≤5 concurrent):
input = finding evidence + extracted original text + trade preset + city + tone rules
("plain words, no marketing jargon, local, trustworthy — write like a good craftsman
talks"). Output schema per channel: `{channel_id, before_excerpt, after: {...channel-
specific fields}, rationale_one_liner}`. Doctors preset adds a compliance instruction
(no healing promises, no superlatives).

### 4.3 Image improvements (gpt-image-1)

- Model `gpt-image-1`, size `1536x1024` (hero) / `1024x1024` (others), quality `medium`
  for latency (~10–20 s each). **Cap: 3 generated images per audit** (hero + 2), P1 raises
  to 5. Prompt template per trade preset, e.g. plumber hero: _"Photorealistic, warm,
  natural-light photo of a friendly professional plumber in branded workwear installing a
  modern bathroom fixture in a German home, honest working atmosphere, no text, no logos."_
- **Truth rule**: every generated image carries a visible corner badge `AI concept` in the
  UI and preview, plus the shot brief for replacing it with a real photo. We never present
  generated images as the business's real work — the pitch line is _"this is what your
  page will feel like; we shoot or you supply the real photos."_
- P1: `images.edit` on the business's best real photo (crop/relight) labeled `enhanced`.
- Failure ladder: generation fails → channel still flips to improved with shot brief +
  best-existing-image recommendation; preview uses the best real harvested image.

### 4.4 Optimized website preview (Before & After)

- Route `/audit/[id]/preview`, presented as a full-screen overlay of the recommendation
  page (the product stays a three-page story), server-rendered from `preview_json` —
  **a fixed one-page template** (Apple-style, section 6) filled with improved channel
  content: nav + hero
  (new H1/subline/CTA + hero image) → trust bar (years/certs/review chip) → services (3
  cards) → work-proof gallery → about/team → contact block (tel CTA) → legal footer.
- **Before state (P0)**: structured "as-is" panel assembled from the extracted original
  text and harvested images (honest facsimile, labeled "what customers see today").
  **P1**: pixel-true screenshot via local Playwright.
- View modes: side-by-side split with a draggable divider (desktop demo default) + a
  Before/After toggle. A floating chip lists what changed ("headline rewritten · 3 images
  upgraded · CTA added · Impressum added").
- The preview is a **static demonstration artifact** rendered by our app; the pitch says
  "publish this for me" is the paid next step — no fake deploy button.

---

## 5. Technical Architecture (localhost)

### 5.1 Stack (v1 minus media tooling, plus image generation)

| Layer      | Choice                                                                      | Notes                               |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------- |
| App        | Next.js 15 App Router + TypeScript, single repo/process                     | Route Handlers = backend            |
| UI         | Tailwind v4 + shadcn/ui + framer-motion (reveal/count-up only)              | Apple-style tokens, section 7       |
| DB         | `better-sqlite3`, file `storage/app.db`                                     | zero config                         |
| Validation | `zod` everywhere; zod → OpenAI Structured Output schemas                    | one source of truth                 |
| AI         | `openai` SDK: `gpt-4o` (vision + text + agents), `gpt-image-1` (generation) | models behind env vars              |
| Search     | `@tavily/core` — **P0 must use**                                            | findability + extract fallback      |
| Memory     | Cognee — **P1 must attempt, simple**                                        | two wrapped calls, non-blocking     |
| Images     | `sharp`                                                                     | normalize harvested/uploaded images |
| Runtime    | Node 20+, pnpm, `pnpm dev` → `http://localhost:3000`                        | no deployment                       |

Removed from v1: `ffmpeg`, `ffprobe`, `yt-dlp`, `whisper-1`, video routes and storage.

`.env`: `OPENAI_API_KEY=` (required) · `TAVILY_API_KEY=` (required) · `COGNEE_API_KEY=` /
`COGNEE_API_URL=` (optional, auto-disables) · `DEMO_MODE=live|replay` ·
`OPENAI_MODEL_TEXT=gpt-4o` · `OPENAI_MODEL_VISION=gpt-4o` · `OPENAI_MODEL_IMAGE=gpt-image-1`.

### 5.2 Repository layout (`code/media-ad-coach/`, own git repo)

```
app/
  page.tsx                       # PAGE 1 · landing — "From Zero to Hero"
  audit/new/page.tsx             # PAGE 2 · input — general info / online presence / attachments
  audit/[id]/page.tsx            # PAGE 3 · RECOMMENDATION — analyzing → score header → channel list — the star
  audit/[id]/preview/page.tsx    # Before/After view (full-screen overlay of page 3)
  history/page.tsx               # utility, not part of the 3-page story
  api/audits/route.ts                    # POST create, GET list
  api/audits/[id]/route.ts               # GET status + report + channels
  api/audits/[id]/assets/route.ts        # POST optional uploads/screenshots
  api/audits/[id]/analyze/route.ts       # POST → 202, async pipeline
  api/audits/[id]/improve/route.ts       # POST {channels: string[]|"all"}
lib/
  db.ts             # better-sqlite3 init + CREATE TABLE IF NOT EXISTS
  schemas.ts        # all zod schemas (Appendix A)
  rubric.ts         # T1–T8 / I1–I6 weights + anchors + scoring + channel derivation
  pipeline/
    orchestrator.ts # stages + progress events
    website.ts      # fetch + cheerio (3.1) + Tavily Extract fallback
    images.ts       # harvest (3.2) + sharp + vision scoring batches
    gbp.ts          # screenshot extraction + precedence (3.3)
    tavily.ts       # findability search + extract
  improve/
    text.ts         # per-channel rewrite calls (4.2)
    image.ts        # gpt-image-1 generation + labeling (4.3)
    preview.ts      # assemble preview_json (4.4)
  memory/cognee.ts  # addAuditMemory() + findSimilarAudits(); 10s timeouts, never throws
  agents/
    experts.ts      # Copy Strategist + Visual Director (parallel) + Synthesizer
    prompts.ts      # Appendix B
    openai.ts       # structured-call helper, 1 retry
  fixtures/replay-audit.json   # full pre-computed audit incl. recorded Tavily result + generated images
storage/            # gitignored: app.db, images/, generated/, tmp/
scripts/check-env.ts # verifies OPENAI + TAVILY keys live at startup
```

### 5.3 Data model

```sql
CREATE TABLE audits (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
  status TEXT NOT NULL,             -- draft|analyzing|scored|improving|complete|failed
  execution_mode TEXT NOT NULL,     -- LIVE|REPLAY
  business_json TEXT NOT NULL,      -- {brand_name, background?, trade, city?, presence:{website?, maps?, yellow_pages?, other[]}, pasted_text?, gbp_manual?}
  evidence_json TEXT,               -- WebsiteEvidence + GbpEvidence + TavilyFindability
  report_json TEXT,                 -- Report v2 (Appendix A)
  preview_json TEXT,                -- assembled After-page content
  overall_score INTEGER
);
CREATE TABLE assets (
  id TEXT PRIMARY KEY, audit_id TEXT NOT NULL REFERENCES audits(id),
  kind TEXT NOT NULL,               -- harvested_image|uploaded_image|gbp_screenshot|generated_image
  source TEXT, storage_path TEXT,
  meta_json TEXT, score_json TEXT,  -- I1–I6 sub-scores for scored kinds
  label TEXT,                       -- NULL | 'ai_concept' | 'enhanced'  (truth badges)
  status TEXT NOT NULL
);
CREATE TABLE channels (
  id TEXT NOT NULL, audit_id TEXT NOT NULL REFERENCES audits(id),
  lane TEXT NOT NULL,               -- text|image|site|video
  title TEXT NOT NULL, priority REAL NOT NULL,
  severity TEXT NOT NULL, status TEXT NOT NULL,   -- todo|improving|improved|coming_soon
  findings_json TEXT NOT NULL,      -- linked findings with evidence quotes
  before_json TEXT, after_json TEXT,
  PRIMARY KEY (audit_id, id)
);
CREATE TABLE progress_events (audit_id TEXT, at TEXT, step TEXT, detail TEXT);
```

### 5.4 API contract

| Endpoint                       | Request                                                                                                                                                                                                  | Response                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /api/audits`             | `{brand_name, background?, trade, city?, presence: {website?, maps?, yellow_pages?, other?: string[]}, pasted_text?, gbp_manual?}` — at least one presence link, pasted text, or uploaded asset required | `201 {auditId}`                                                                                                |
| `POST /api/audits/:id/assets`  | multipart, optional                                                                                                                                                                                      | `201 {assetId}`                                                                                                |
| `POST /api/audits/:id/analyze` | —                                                                                                                                                                                                        | `202`; async pipeline; progress via polling                                                                    |
| `GET /api/audits/:id`          | —                                                                                                                                                                                                        | `{status, progress[], report?, channels?, preview_ready}`                                                      |
| `POST /api/audits/:id/improve` | `{channels: string[] \| "all"}`                                                                                                                                                                          | `202`; per-channel status flips to `improving` → `improved`; when `all` completes, `preview_json` is assembled |
| `GET /api/audits`              | —                                                                                                                                                                                                        | history rows                                                                                                   |

The `Report` + `Channel` zod schemas (Appendix A) are frozen in hour 0 — the frontend/
backend parallel-work contract.

### 5.5 Orchestration

```
ANALYZE
Stage 1 · Evidence (parallel)
  ALL presence links fetched+extracted: website, Maps-derived, Yellow Pages, Check24/other
  (each with Tavily Extract fallback) · image harvest+normalize · pasted text ingested
  cross-platform NAP comparison (deterministic) · tavily findability "{trade} {city}"
  gbp screenshots (if given) · cognee findSimilarAudits (P1, 10s, silent-skip)
Stage 2 · Experts (2 parallel GPT-4o structured calls)
  ① Copy Strategist  → T1–T8 sub-scores + findings (quotes exact site text)
  ② Visual Director  → I1–I6 per image + coverage gaps + red flags
Stage 3 · Rubric Engine (pure TS)
  totals + bands + findings → channel derivation + priority ranking (2.5)
Stage 4 · Synthesizer (1 GPT-4o call)
  executive summary + channel row one-liners + optional Cognee line
  — may NOT change any number
Stage 5 · persist → status=scored · fire-and-forget cognee addAuditMemory

IMPROVE (on demand, per channel or "all")
  text channels → improve/text.ts (parallel ≤5)
  image channels → improve/image.ts (gpt-image-1, cap 3, labeled)
  then improve/preview.ts assembles preview_json → status=complete
```

Latency budget: analyze ≈ 30–50 s (no video anymore) · improve-all ≈ 45–75 s (image
generation dominates) — both covered by staged progress UI.

Progress steps: `reading_site → collecting_images → checking_local_search →
recalling_similar_audits → experts_scoring → building_channels → done`; improve:
`rewriting_text → generating_images → assembling_preview → done`.

### 5.6 Execution modes (truth discipline, unchanged)

LIVE badge on real runs; `DEMO_MODE=replay` / `?mode=replay` loads the full fixture
(pre-computed audit of the sample plumber incl. recorded Tavily result and pre-generated
images) with a `REPLAY SAMPLE` badge. A failed live call is never silently replaced.

### 5.7 Cognee (P1, contract unchanged from v1)

`addAuditMemory(audit)` after completion (summary: name, trade, city, scores, top finding
titles) and `findSimilarAudits(trade, city)` at analyze start; ≥1 real hit → the
synthesizer writes exactly one line ("Compared to N similar businesses we audited, the
weakest shared area is {lane}") + a "memory: Cognee" chip; failure/absence → nothing
renders, nothing blocks. Floater seeds 2–3 audits during rehearsal so the demo recall is
real. README describes it truthfully as light-touch memory.

---

## 6. Frontend Specification — Apple-Style System

Design mandate from the team: **every page beautiful, every page simple — Apple website
style.** Builders load the workspace `apple-design` skill before implementing UI. One idea
per screen, generous whitespace, restrained color, calm motion.

### 6.1 Design tokens

| Token      | Value                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Background | `#FFFFFF`; alternate sections `#F5F5F7`                                                                                                   |
| Text       | primary `#1D1D1F`, secondary `#6E6E73`                                                                                                    |
| Accent     | Apple blue `#0071E3` (CTAs, links); success `#34C759` only for `improved` states                                                          |
| Type       | system stack (`-apple-system, SF Pro Display, Inter, sans-serif`); H1 56–72px semibold tracking-tight; section titles 40px; body 17px/1.5 |
| Buttons    | pill (`rounded-full`), blue fill/white text primary; quiet gray secondary                                                                 |
| Cards      | `rounded-2xl`, `#F5F5F7` fill or white + hairline border `#D2D2D7`, no drop shadows heavier than `shadow-sm`                              |
| Nav        | sticky, translucent `backdrop-blur`, hairline bottom border                                                                               |
| Motion     | 200–300 ms ease-out; fade+rise on scroll; score count-up; `prefers-reduced-motion` respected                                              |

### 6.2 Pages — a three-page product (team page design)

**Page 1 — Landing `/`**
Full-bleed centered hero: eyebrow "Visibel", H1 **"From Zero to Hero."**, subline
"Show us your business. See what customers see. Let us fix it.", one pill CTA →
Input page. Below: three quiet feature cards (Score → Improve → Before/After) and a
sample-report link (opens the REPLAY audit). Nothing else.

**Page 2 — Input `/audit/new`**
One calm scrolling form, three Apple-style grouped sections (rounded cards on `#F5F5F7`,
hairline dividers, one sticky pill CTA "Check my business"):

- **A · General information** — brand name (text), background (trade/category pills:
  plumber / electrician / roofing / handyman / doctor / other, + optional one-line
  description "what do you do best?"), location (city, optional service radius).
- **B · Online presence** — one labeled URL field per surface: Business website ·
  Google Maps · Yellow Pages (Gelbe Seiten) · Check24 / other platform pages (repeatable
  "+ add another" field). Each field shows a small platform icon and validates as URL.
- **C · Attachments** — manual text input (textarea: "paste your ad text, flyer text, or
  description") · image dropzone (≤10) · quiet disclosure slot for GBP screenshots.

Validation: at least one presence link OR one attachment. Empty fields are allowed and
meaningful — a missing website is a finding, not an error.

**Page 3 — Recommendation `/audit/[id]` — THE demo page.**
Everything after input lives on this one route, top to bottom:

- **Analyzing state**: calm progress checklist (steps from 5.5) while the pipeline runs.
- **Score header**: giant animated overall number + band label + mode badge; two lane
  cards (Text / Images) with criterion bars; findability, platform-coverage, and
  reputation context chips; evidence highlights (worst quotes, worst images, tappable).
- **Action strip**: "N things stand between you and Hero." + primary pill
  **Do It For You**.
- **Channel list**: one row per channel — left = icon, title, one-line verdict, severity
  dot + mini before-excerpt; right = **`Improve It`** pill button. Row states: `todo`
  (blue) → `improving` (spinner) → `improved` (green check, button becomes "View result",
  inline before→after reveal expands). `optimized_site` pinned top as a full-width row
  whose button is **Do It For You**; `promo_video` pinned bottom, grayed, "Coming soon".
- **Click action → see the improved presence**: text channels reveal rewritten copy
  inline; image channels reveal generated images (badged `AI concept`) beside the
  originals; when `optimized_site` completes, a sticky bar appears — "Your new page is
  ready" → opens the **Before/After view** (`/audit/[id]/preview`, presented as a
  full-screen overlay of this page: split view with draggable divider + toggle, the
  assembled Apple-style one-pager, floating "what changed" chips, header
  "{Business} — from Zero to Hero.", close returns to the channel list).

**Utility (not part of the 3-page story)**: `/history` — quiet table proving persistence.

---

## 7. Execution Schedule (T0 = coding start, ~5 h; video removal frees ~1.5 h → invested in the action page + preview polish)

| Time       | Goal                                                                                                                                                                                                                   | Exit test                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T0–T0:30   | Scaffold; `check-env.ts` (OpenAI + Tavily live smoke); freeze Report/Channel zod schemas + rubric constants; REPLAY fixture skeleton; design tokens file                                                               | fixture renders; both partner keys verified                    |
| T0:30–1:30 | **Tracer bullet**: minimal input form → all presence links fetched/extracted (+ Tavily fallback + findability) → image harvest → 2-expert scoring → rubric engine → recommendation-page score header with real numbers | one real plumber site scored end-to-end, ugly allowed          |
| T1:30–2:30 | Channel derivation (+ cross-platform consistency) + **recommendation-page channel list** (rows, Improve It buttons, states); full 3-section input page; text improve endpoint live for all text channels               | click Improve It on `hero_headline` → real before/after inline |
| T2:30–3:30 | gpt-image-1 generation (cap 3, labels) + preview assembly + **Before/After page** with split view; Do It For You runs "all"                                                                                            | full Zero-to-Hero walkthrough on a real site                   |
| T3:30–4:15 | Apple-polish pass on all pages (tokens, motion, empty/error states); Cognee add+search (P1); history page; GBP screenshot path                                                                                         | demo-grade visuals; memory line renders from seeded audits     |
| T4:15–5:00 | Full REPLAY fixture from a real run (incl. Tavily result + generated images); 3 rehearsals; 2-min video; README; submit                                                                                                | receipt before 19:00; demo survives Wi-Fi loss                 |

**Kill lines**: T+90 tracer not through → drop image harvesting to uploads-only ·
T+165 image generation unstable → channels improve with shot briefs + best real photos;
**the preview page is never cut** (degrade to text-only After) · **Tavily is never cut**
(on venue API errors: integration + README stay, findability chip shows honest error,
judgments labeled `ASSUMPTION`, REPLAY shows the recorded call) · Cognee unstable by
T+225 → keep wrapped calls behind env flag, demo without the line — never fake it ·
T+255 → feature freeze, reliability only.

Team split: **A Frontend** (score/action/preview pages — depends only on frozen schemas)
· **B Pipeline** (fetch/extract/harvest/vision/Tavily) · **C Improve engine + agents**
(rubrics, rewrites, gpt-image-1, preview assembly, fixtures) · **D Floater** (before T0:
pick 2–3 real weak sites — plumber, repair service, doctor — and capture fixture material;
then README, video, submission watch).

---

## 8. Acceptance Criteria (stop-ship)

- [ ] The product is the three-page story: Landing → Input (three sections: general
      information / online presence / attachments) → Recommendation page; input → complete
      score in ≤60 s.
- [ ] All totals computed by `rubric.ts` (unit test: fixed sub-scores → exact totals).
- [ ] Text findings quote the actual sentences (website or portal, source-tagged); image
      findings reference the actual harvested photo (thumbnail shown); inconsistent
      name/phone/address across platforms surfaces as its own channel row.
- [ ] Recommendation page: every weak item is a row; `Improve It` works per-row; **Do It
      For You** improves everything and unlocks the Before/After overlay; `promo_video`
      row visibly Coming soon.
- [ ] Before/After preview renders the assembled optimized page; every generated image
      carries the `AI concept` badge; the "what changed" list is accurate.
- [ ] **Tavily runs in every LIVE audit** (findability chip with expandable real results)
      and README documents it as load-bearing.
- [ ] **Cognee**: memory line renders only from a real retrieved audit; absent key =
      silently disabled; README states the deliberately simple usage.
- [ ] Refresh-safe (SQLite); history lists audits; LIVE/REPLAY badges truthful everywhere.
- [ ] README: setup, architecture, partner usage (OpenAI + Tavily + Cognee), boilerplate
      boundary, "video analysis/generation not implemented" statement. No secrets in repo.

## 9. Risks & Countermeasures

| Risk                                 | Countermeasure                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Target site blocks fetch / JS-only   | Tavily Extract fallback (P0); both fail → honest "unreachable" verdict; demo sites pre-verified by floater before T0                  |
| gpt-image-1 latency/quota at venue   | cap 3 images, `medium` quality, parallel with text; failure → shot briefs + real photos; REPLAY carries pre-generated images          |
| Generated images read as deceptive   | mandatory `AI concept` badges + replace-with-real-photo briefs; pitch language rehearsed                                              |
| Tavily quota/outage                  | key smoke-tested at T0; runtime error → honest chip error + `ASSUMPTION` labels; recorded result in REPLAY; integration never removed |
| Cognee eats time                     | two wrapped calls, 10 s timeouts, env-flagged; failure = feature absent, never faked                                                  |
| Venue network / OpenAI limits        | REPLAY one keystroke away; never first-run live on stage                                                                              |
| Apple-style polish eats the schedule | tokens frozen at T0; polish is a single bounded pass at T3:30; layout primitives (pill, card, section) built once and reused          |
| Scoring feels arbitrary              | fixed weights printed on the score page; every number click-traceable to a quote or photo — the Technical Execution pitch line        |

---

## Appendix A — Frozen schemas (zod, abbreviated)

```ts
const Criterion = z.object({
  id: z.string(),
  score: z.number().int().min(0).max(5),
  evidence: z.string(),
  source: z.enum([
    "fetched",
    "tavily",
    "vision",
    "screenshot",
    "manual",
    "absent",
  ]),
});
const Finding = z.object({
  id: z.string(),
  lane: z.enum(["text", "image"]),
  criterion: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  evidence_quote: z.string(),
  asset_ref: z.string().nullable(),
});
const Channel = z.object({
  id: z.string(),
  lane: z.enum(["text", "image", "site", "video"]),
  title: z.string(),
  one_liner: z.string(),
  priority: z.number(),
  severity: z.enum(["high", "medium", "low"]),
  status: z.enum(["todo", "improving", "improved", "coming_soon"]),
  finding_ids: z.array(z.string()),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
const Report = z.object({
  overall_score: z.number().int(),
  band: z.string(),
  text: z.object({ score: z.number().int(), criteria: z.array(Criterion) }),
  images: z.object({
    score: z.number().int(),
    criteria_by_asset: z.record(z.array(Criterion)),
    coverage_gaps: z.array(z.string()),
  }),
  findability: z.object({
    status: z.enum(["found", "portals_only", "not_found", "error"]),
    results: z.array(z.object({ title: z.string(), url: z.string() })),
    source: z.literal("tavily"),
  }),
  presence_coverage: z.object({
    website: z.boolean(),
    maps: z.boolean(),
    yellow_pages: z.boolean(),
    other_count: z.number().int(),
    nap_consistent: z.boolean().nullable(),
  }),
  reputation_chips: z
    .object({
      review_count: z.number().nullable(),
      rating: z.number().nullable(),
      has_photo_reviews: z.boolean().nullable(),
    })
    .nullable(),
  findings: z.array(Finding),
  channels: z.array(Channel),
  executive_summary: z.string(),
  memory_note: z
    .object({ text: z.string(), similar_count: z.number().int() })
    .nullable(),
  execution_mode: z.enum(["LIVE", "REPLAY"]),
  disclaimers: z.array(z.string()),
});
```

## Appendix B — Agent system prompts (drafts)

**Copy Strategist**: _"You are a top local-marketing copy expert for small service
businesses (trades, medical practices). Score criteria T1–T8 strictly against the anchors.
Use ONLY the extracted text evidence. Every score ≤2 needs a finding quoting the exact
sentence (or naming the exact absence). For medical businesses, flag any healing promise
or superlative as a T7 red flag. Output JSON per schema. Never invent content."_

**Visual Director**: _"You are a performance-creative director who has reviewed 10,000
local-business photos. Score each image on I1–I6 from what you see; name failures
concretely ('blurry boiler close-up, no human, no outcome'). Then report coverage gaps:
hero / team / work-proof / branding shots missing from the set. Output JSON per schema."_

**Synthesizer**: _"Write the executive summary and one-line channel verdicts for a busy
owner: plain words, no jargon, each verdict names the concrete problem. You may not alter
any score or ranking. If similar-audit memories were provided, add the single comparison
line; otherwise omit it."_

**Rewriter (per text channel)**: _"Rewrite ONLY this channel's content for {trade} in
{city}. Keep it honest: no invented certifications, no guarantees, no superlatives. Plain,
local, trustworthy voice. Return before_excerpt and the channel-specific after fields."_

**Image generation (per trade preset)**: prompt templates in `improve/image.ts`, reviewed
once at T2:30; all outputs labeled `AI concept`.
