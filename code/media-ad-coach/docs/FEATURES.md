# Feature registry — Visibel

> **Anonymization note (2026-07-22):** live evidence in this registry was
> gathered against real Berlin businesses. For publication, every business
> name, phone number, address, URL, Maps token, and quoted listing detail has
> been replaced with fictional stand-ins ("Muster + Sohn GmbH",
> "M. Mustermann", `*.example` domains). Timings, scores, and pipeline facts
> are unchanged. The `docs/evidence/` screenshots referenced below were removed
> before publication because they showed the real businesses; the references
> are kept as historical record.

Single source of truth for every capability of this product going forward. The event-time
tracker (`../../../docs/team-idea/final-implement-plan/FEATURE-TRACKER.md`, F-001–F-097)
is the frozen historical record of what was built during the hackathon; THIS file is the
live registry for everything after it.

**Process (mandatory — the only path for new work):**

1. **Every new requirement is broken down into feature entries HERE first** — before any
   implementation. One entry per independently shippable slice: ID, title, user story or
   "why", acceptance criteria, owned paths. A requirement too vague to break down is
   registered as `PROPOSED` until it can be.
2. **Implementers work FROM the registry only**: pick a `TODO` entry, set `IN_PROGRESS`,
   build inside the entry's owned paths, record touched files and the acceptance result,
   set `BUILT`. A real end-to-end run promotes it to `VERIFIED`.
3. **One feature = one branch.** Cut `feat/fea-<id>-<slug>` from main, implement and
   verify on the branch (acceptance + tsc + tests + build), merge back to main resolving
   all conflicts, then take the next entry. Concurrent features each branch independently
   from main — never from another feature branch.
4. Nothing is implemented without a registry entry, and no entry is deleted — rejected or
   descoped work is marked `REJECTED`/`DEFERRED` with a rationale so decisions survive.
4. Defects in existing behavior go to `docs/ISSUES.md`, not here. Rule of thumb: "it
   should do something new" → feature; "it does the wrong thing" → issue.

**Statuses:** `PROPOSED` (needs breakdown or human decision) → `TODO` (ready to build) →
`IN_PROGRESS` → `BUILT` (code + tests landed) → `VERIFIED` (proven end-to-end) · plus
`REJECTED` / `DEFERRED` with rationale.

| ID | Title | Status | Owner |
|----|-------|--------|-------|
| FEA-101 | Live Google Maps / GBP corroboration from a bare Maps link | VERIFIED | agent backend-integrator |
| FEA-102 | Landing page states plainly what the product does | BUILT | agent frontend-builder |
| FEA-103 | Unified redesign: intake form + report pages match the landing design language | BUILT | agent frontend-builder |
| FEA-104 | Business-type selector: popular quick-picks, multi-select, and free-text entry | BUILT | agent frontend-builder |
| FEA-105 | Landing hierarchy: business statement dominant, slogan secondary, dead-simple start guidance | BUILT | agent frontend-builder |
| FEA-106 | Improvement showcase: large-type color-coded text diff + large image reveals | BUILT | agent frontend-builder |
| FEA-107 | Landing hero: imperative customer-acquisition hook copy | BUILT | agent frontend-builder |
| FEA-108 | Channel-themed diagnostic modules with UI-built Google mockups | BUILT | agent frontend-builder |
| FEA-109 | Score visualization: graded red-amber-green bars + row layout polish | BUILT | agent frontend-builder |
| FEA-110 | After-page services section redesign + curated originals layout | BUILT | agent frontend-builder |
| FEA-111 | Global one-click "optimize everything" CTA with live progress, per-item states and failure recovery | VERIFIED | agent frontend-builder |
| FEA-112 | Asynchronous image generation: the report completes first, streamed images land into the live page | VERIFIED | agent backend-integrator |
| FEA-113 | `pnpm smoke:api` — 30-second live smoke test of the text, image and search provider calls | VERIFIED | agent backend-integrator |
| FEA-114 | Image content taxonomy, per-trade composition quotas, and gap-filling generation | VERIFIED | agent backend-integrator |
| FEA-115 | Report page shows the streamed partial frame while an image is still generating | VERIFIED | agent frontend-builder |
| FEA-116 | Business name leads the generated site: hero wordmark, bigger header brand, footer on every page | VERIFIED | agent frontend-builder |
| FEA-117 | Gallery minimum of four images, filled with distinct generated content | VERIFIED | agent backend-integrator |

---

## FEA-101 — Live Google Maps / GBP corroboration from a bare Maps link

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-101-live-gbp-corroboration`) — real
  end-to-end run against the live listing, fields proven persisted (evidence below).
- **Human decision (2026-07-21):** scrape the public Maps listing with the Playwright build
  this repo already ships. Explicitly NOT the official Places API — no new billing, no new
  credential, no new dependency. Tavily stays the separate findability signal.
- **Why:** Users expect pasting a Google Maps link to feed real Maps data into the score and
  the "Do It For You" optimization. Before this, a bare link contributed zero fields by
  design (P0 had no Places API) — see ISS-009.
- **Acceptance:** an audit created with a Maps URL persists real listing evidence with an
  honest source label, or a structured "no live Maps data" reason — never silence, never a
  fabricated field. REPLAY must not perform any live read.
- **Owned paths:** `lib/pipeline/gbp-live.ts` (new), `lib/pipeline/gbp.ts`,
  `lib/pipeline/orchestrator.ts` (one call-site flag), `lib/schemas.ts` (additive optional
  fields only), `tests/gbpLive.test.ts` (new).
- **Result (BUILT):**
  - New `lib/pipeline/gbp-live.ts`, split into a PURE cheerio parser
    (`extractLiveGbpFromHtml`) and a thin, never-throwing browser shell (`fetchLiveGbp`)
    that follows `maps.app.goo.gl` short links, dismisses the EU consent interstitial
    (reject-all — verified to yield the same panel as accept-all, and stores no ad
    cookies), settles the place panel, scrolls it once, and hands `page.content()` to the
    parser. Non-Maps URLs are rejected before a browser is even launched.
  - Extracted fields: `name`, `phone`, `address`, `website`, `rating`, `review_count`,
    `opening_hours_text`, `has_listing_photos` (real listing photo vs. Street View
    fallback), up to 5 deduped `review_snippets` (author / rating / text), and
    `limited_view`.
  - `GbpEvidence` gained ADDITIVE OPTIONAL fields only — `phone`, `opening_hours_text`,
    `has_listing_photos`, `review_snippets`, `live_source: "live_maps"`, `live_fetched_at`,
    `live_limited_view`, `live_error`. `source` keeps its three frozen values
    (`manual|screenshot|link`) so existing consumers are untouched; a live contribution is
    marked by `live_source`.
  - Precedence is now manual > live Maps read > screenshot vision-extraction > bare link
    (live outranks the screenshot tier because it is a direct DOM read, not a model reading
    a picture). Live-only facts are added, never conflated with `has_photo_reviews`.
  - Every failure path degrades structurally into `live_error: {reason, detail}` with
    reasons `not_a_maps_url | playwright_unavailable | browser_unavailable | consent_blocked
    | timeout | selector_miss | fetch_failed`, and the audit still completes.
  - REPLAY is untouched: `runReplayPipeline` never calls `collectGbpEvidence`, and the
    collector additionally takes an explicit `allowLiveFetch` opt-out.
- **Evidence (FACT, 2026-07-21):** real `fetchLiveGbp` runs, no mocks —
  - `https://maps.app.goo.gl/ExampleMapTokenA1` (MUSTER + SOHN GmbH) → 6.3 s, resolved to the
    canonical `google.com/maps/place/Muster+%2B+Sohn+GmbH/...` URL; `name: "Muster + Sohn
    GmbH"`, **`phone: "030 12345678"`** (the number the website only prints as plain text),
    `address: "Musterstraße 24, 10999 Berlin-Bezirk Friedrichshain-Kreuzberg"`,
    `website: "muster-sanitaer.example"`, `rating: 3`, `opening_hours_text: null` (the listing genuinely
    has none — Maps offers "Add hours"), `has_listing_photos: false` (Street View fallback
    only), `limited_view: true`.
  - `https://maps.app.goo.gl/ExampleMapTokenB2` (M. Mustermann) → 5.6 s; `phone: "030 7654321"`,
    `rating: 4.8`, `opening_hours_text: "Tuesday10 am–2 pm"`, `has_listing_photos: true`.
  - **Persistence proof:** `collectGbpEvidence(mapsUrl = the real short link)` → `updateAudit`
    → `getAudit` round-trip through the real SQLite layer returned
    `evidence_json.gbp = {rating: 3, source: "link", phone: "030 12345678",
    opening_hours_text: null, has_listing_photos: false, live_source: "live_maps",
    live_fetched_at: "2026-07-21T18:59:08.255Z", live_limited_view: true}`.
  - One run additionally captured 3 deduped real review snippets (1★ and 5★ German/English
    reviews) — see the known limitation below.
- **Known limitation (honest):** signed-out Google Maps usually serves a reduced place panel
  ("You're seeing a limited view of Google Maps") with no review list and no review count.
  `review_count` is then `null` and `review_snippets` empty, with `live_limited_view: true`
  recorded so `null` is never read as "zero reviews". 1 of 5 real runs did receive the full
  panel and yielded review snippets, so the parser path is proven — it is Google's response
  that varies, and nothing is fabricated when it does not.
- **Not done here (deliberate):** rendering these fields in the report UI, and feeding them
  into the Copy Strategist prompt / rubric — separate frontend and scoring work items.
- **Linked:** ISS-009 (DEFERRED — superseded by this feature), ISS-025.

## FEA-102 — Landing page states plainly what the product does

- **Status:** BUILT (2026-07-20, branch `feat/fea-102-landing-hero-clarity`)
- **Source:** human feedback 2026-07-20 (`../../../../visibel-优化意见/visibel-feedback.md`, item 1).
- **Why:** The landing hero is slogan-only; a first-time visitor cannot tell what the app
  is. It must say concretely: Visibel helps local business owners improve how their
  business shows up online (online presence / marketing presence) — audit it, then
  one-click optimize it.
- **Acceptance:** Reading only the hero (headline + subline, no scrolling) a stranger can
  answer "what does this app do and for whom". Concrete descriptor wording, not a bare
  slogan; the audit CTA stays primary. Design language unchanged (existing tokens/
  primitives), English UI copy.
- **Owned paths:** `app/page.tsx` (hero/landing copy blocks only).
- **Result (BUILT):** Rewrote the hero eyebrow + subline in `app/page.tsx` — eyebrow now
  reads "Online presence for local business owners"; the subline concretely states Visibel
  audits how a business shows up online (website, listings, photos) and rewrites copy +
  images in one click. Headline "From Zero to Hero." and the primary "Check my business"
  CTA unchanged; existing tokens/primitives only. Acceptance met: hero alone conveys what +
  for whom. Gates green — `tsc --noEmit`, `pnpm test` (285 passed), `pnpm build`.

## FEA-103 — Unified redesign: intake form + report pages match the landing design language

- **Status:** BUILT (2026-07-20, branch `feat/fea-103-unified-redesign`)
- **Source:** human feedback 2026-07-20 (item 2).
- **Why:** The post-landing intake/config form ("fill in your business info") and the
  report pages (score + recommendations) look under-designed compared to the landing —
  inconsistent controls, weak layout. Both must share the same design system so the whole
  flow feels like one product.
- **Acceptance:**
  - Both pages built exclusively from `app/globals.css` tokens + `components/primitives/*`
    (extend primitives rather than inline one-off styles).
  - Deliberate column logic at desktop width: two-column where content warrants (e.g. form
    sections beside guidance/summary; report evidence beside photos), single-column where
    it doesn't; no accidental full-width sprawl.
  - Controls, icons, chips, badges, and spacing visually consistent with the landing and
    Before/After preview aesthetic; no default-browser-looking widgets.
  - Visual QA screenshots (landing → intake → report) captured as evidence.
- **Owned paths:** `app/page.tsx` (intake area), `app/audit/**`, `components/input/**`,
  `components/report/**`, `components/primitives/*` and `app/globals.css` (serialized —
  frontend lane is the single writer while this feature is IN_PROGRESS).
- **Result (BUILT):**
  - New shared primitives (extend, not inline): `components/primitives/Eyebrow.tsx`,
    `components/primitives/Field.tsx` (`FieldLabel`/`TextInput`/`TextArea` + one
    `fieldControlClass`), `components/primitives/Chip.tsx` (`Chip` toggle +
    `RemovableChip`); exported via `components/primitives/index.ts`. `app/globals.css`
    needed no change — the redesign is entirely existing tokens + these primitives.
  - Intake redesigned (`app/audit/new/page.tsx`): deliberate desktop two-column —
    Sections A/B/C beside a sticky guidance rail ("What you'll get" + a live "Ready to
    check" readiness checklist bound to form state), sticky pill CTA. Also fixed a latent
    no-op `text-eyebrow` class (now the `Eyebrow` primitive). Input sections
    (`GeneralInfoSection`, `PresenceSection`, `AttachmentsSection`) refactored onto the
    shared field/chip primitives — no default-browser widgets remain. Submit flow /
    `BusinessInput` construction unchanged.
  - Report redesigned (`components/report/*` + `app/audit/[id]/page.tsx`): business name
    now shown as the report subject (`ScoreHeader`), the previously-unrendered
    `report.executive_summary` now surfaces as a "Summary" lead section (`ReportView`),
    and every block carries a structural eyebrow — "Where you stand online"
    (`ContextChips`), "The evidence" (`EvidenceHighlights`), "Your action list"
    (`ActionStrip`). All polling / improve interactivity preserved.
  - Acceptance met: both pages built only from tokens + primitives; deliberate desktop
    column logic (form beside guidance, evidence beside photos); controls/chips/badges
    consistent with the landing + Before/After aesthetic. Evidence:
    `docs/evidence/redesign-20260720/` — `01-landing.png`, `02-intake.png`,
    `02b-intake-fold.png`, `03-report.png` (REPLAY via `/audit/sample`),
    `04-intake-mobile.png`. Gates green — `tsc --noEmit`, `pnpm test` (285 passed),
    `pnpm build`.

## FEA-104 — Business-type selector: popular quick-picks, multi-select, and free-text entry

- **Status:** BUILT (2026-07-20, branch `feat/fea-104-business-type-selector`)
- **Schema decision (no change needed — `lib/schemas.ts` stays FROZEN):** the frozen
  `trade` is a strict enum, so it cannot itself hold multi-select + free text. The
  multi-select labels and custom entries are encoded into the existing free-text
  `BusinessInput.background` string (which the pipeline already consumes — see
  `lib/agents/prompts.ts`, `lib/improve/preview.ts`), and a single canonical `trade` enum
  is derived from the selection (first quick-pick that maps to a real trade, else
  `other`). No additive schema change and therefore no cross-lane agreement required.
- **Source:** human feedback 2026-07-20 (item 3).
- **Why:** Business-type selection must not be a closed fixed list. Users need popular
  category quick-picks (chips), the ability to select more than one, and a free-text
  field for anything not listed.
- **Acceptance:** Intake offers ~6–10 popular categories as one-tap chips; multiple can be
  selected; a free-text "other" input adds custom types; selections + custom text are
  submitted and reach the audit pipeline unchanged. If `lib/schemas.ts` needs a change it
  requires explicit cross-lane agreement recorded in this entry BEFORE the edit (schemas
  file is frozen). UI matches FEA-103 design language.
- **Owned paths:** `components/input/**`, `app/page.tsx` (intake wiring); `lib/schemas.ts`
  only with recorded agreement.
- **Result (BUILT):**
  - `components/input/GeneralInfoSection.tsx`: the single-select trade pill group is now an
    OPEN multi-select — 10 popular quick-pick chips (Plumber, Electrician, Roofer, Handyman,
    Doctor / Clinic, Restaurant / Café, Retail shop, Beauty / Salon, Fitness / Gym, Auto
    repair) built from the `Chip` primitive, plus a free-text input that commits custom
    entries as `RemovableChip`s (Enter or "Add"). `GeneralInfo.trade` became
    `GeneralInfo.businessTypes: string[]`. Exports `deriveTrade` (first quick-pick mapping
    to a real `Trade`, else `"other"`) and `formatBusinessTypes` (the `Business type: …`
    line).
  - `app/audit/new/page.tsx` (the real intake wiring — the entry's "app/page.tsx" is
    imprecise): initial state, the gate message, and the readiness checklist updated; on
    submit it derives one canonical `trade` and encodes the whole selection into
    `background` alongside the optional description. `lib/schemas.ts` UNTOUCHED (frozen).
  - **End-to-end proof (analyze stubbed — no LIVE model calls / no spend):** selecting
    "Restaurant / Café" + "Retail shop" and adding customs "Specialty coffee roaster"
    (Enter) + "Bakery" (Add) submitted, and the persisted `business_json` read back from
    `storage/app.db` was `trade="other"`, `background="Business type: Restaurant / Café,
    Retail shop, Specialty coffee roaster, Bakery."` — every selection and custom entry
    reaches the pipeline unchanged. Evidence: `docs/evidence/redesign-20260720/05-business-type.png`.
    Gates green — `tsc --noEmit`, `pnpm test` (285 passed), `pnpm build`.

## FEA-105 — Landing hierarchy: business statement dominant, slogan secondary, dead-simple start guidance

- **Status:** BUILT (2026-07-21, branch `feat/fea-105-landing-hierarchy`)
- **Source:** human feedback 2026-07-21 (follow-up to FEA-102): the slogan is now the
  biggest thing on the page; the BUSINESS statement must dominate instead.
- **Why:** A visitor must grasp the problem we solve at first glance. The value statement
  — "we help local business owners improve their online marketing presence" — must be the
  visually dominant element; the slogan becomes small/secondary flavor.
- **Acceptance:**
  - The largest, boldest (near-black ink) text on the landing page is the business value
    statement (improve how your business shows up online / online marketing presence);
    the slogan is visibly subordinate (small eyebrow or subline).
  - Start guidance next to the CTA is dead simple, ≤2 short lines, plain words: enter
    basic business info + your website link → we analyze it and generate a one-stop
    optimization plan. No jargon.
  - Visual hierarchy verified by screenshot evidence.
- **Owned paths:** `app/page.tsx` (hero/landing blocks), `components/primitives/*` if a
  size token/primitive tweak is needed.
- **Result (BUILT):** Inverted the hero hierarchy in `app/page.tsx`. The slogan "From Zero
  to Hero" is now a small uppercase eyebrow; the dominant, largest, near-black element is
  the value statement "Improve how your business shows up online."
  (`clamp(2.75rem…5.5rem)`, well above every other element). A supporting subline names the
  audience (local business owners) + audit/optimize. Added a dead-simple two-line start
  guide under the CTA: "Add your business basics and your website link. We analyze it and
  build your one-stop optimization plan." No `globals.css`/primitive change needed (arbitrary
  clamp on the h1). Evidence: `docs/evidence/redesign-20260721/01-landing-hero.png`. Gates
  green — `tsc --noEmit`, `pnpm test` (297 passed), `pnpm build`.

## FEA-106 — Improvement showcase: large-type color-coded text diff + large image reveals

- **Status:** BUILT (2026-07-21, branch `feat/fea-106-improvement-showcase`)
- **Source:** human feedback 2026-07-21: the post-score optimization results have no
  "wow" — before vs after is not visibly different.
- **Why:** The improvement IS the product's payoff. Users must see, at a glance and at
  full size, exactly what got better: what text changed and what images were created or
  enhanced. Today the results render small and undifferentiated.
- **Acceptance:**
  - **Text before/after:** old and new copy shown in large readable type (no smaller than
    the report's base body size; key lines display-scale). Differences explicitly marked:
    newly added sentences carry the existing red/rust accent; newly created content is
    bold, near-black, and larger; unchanged text stays quiet. A small word/sentence-level
    diff utility may be added inside frontend-owned paths (unit-tested, relative imports).
  - **Images:** every generated or enhanced image is presented LARGE (full-card/
    full-width, not thumbnails) and click-to-zoom opens a full-size lightbox (no new
    dependency; build on existing primitives/overlay patterns). Truth badges (AI concept /
    enhanced, LIVE/REPLAY) remain on every surface including the lightbox.
  - One glance at the results section shows what improved; emphasize the delta, quiet the
    chrome. Verified by screenshot evidence (replay mode acceptable).
- **Owned paths:** `components/report/**`, `components/preview/**`, `app/audit/**`,
  `components/primitives/*`, `app/globals.css` (serialized — frontend lane sole writer),
  plus frontend-owned diff util + tests.
- **Result (BUILT):**
  - **Diff util:** `lib/client/textDiff.ts` — pure word-level LCS diff (`diffWords`,
    `diffAfter`, `diffBefore`, `hasAddedWords`), unit-tested in `tests/textDiff.test.ts`
    (10 cases, relative imports). No deps.
  - **Text before/after** (`components/report/BeforeAfterInline.tsx`): the reworked line is
    display-scale (`clamp` up to ~2.75rem) with newly added words in the red/rust accent
    (`text-destructive`); the quiet "Before" line above strikes removed words; brand-new
    pieces (subline, CTA, GBP copy, services, NAP) render bold near-black under a "New" tag.
    Nothing renders below the report base body size.
  - **Images:** new `components/primitives/Lightbox.tsx` (full-screen zoom on the existing
    fixed-overlay pattern, Escape/scrim close, z-[70], no new dependency) + new
    `components/report/ZoomableAssetImage.tsx`. Improvement reveals now show originals vs
    generated/enhanced photos LARGE and side by side (`sm:grid-cols-2`, `aspect-[4/3]`),
    each click-to-zoom. Preview `AfterPanel` hero/gallery/team images are large + zoomable
    too. Truth badges (AI concept / Enhanced, LIVE/REPLAY) are forwarded to the lightbox;
    `executionMode` is threaded ReportView→ChannelList→ChannelRow→BeforeAfterInline and
    PreviewOverlay→SplitView→AfterPanel. `app/globals.css` needed no change.
  - **Evidence** (`docs/evidence/redesign-20260721/`, REPLAY via `/audit/sample`):
    `06-text-diff.png` (large color-coded headline diff + New subline/CTA),
    `07-image-before-after.png` (large AI-concept reveal), `07b-image-fixes.png` (original
    vs enhanced side by side), `08-image-lightbox.png` (zoom with truth badges intact),
    `09-preview-after.png` (preview large zoomable hero). Gates green — `tsc --noEmit`,
    `pnpm test` (307 passed, incl. 10 diff tests), `pnpm build`.
- **Design review round 1 (2026-07-21) — verdict ITERATE → resolved on branch
  `feat/fea-106-polish-r1`:**
  - Image reveal (biggest lever): `GeneratedImageReveal` now makes the AI concept the hero
    (full-width `aspect-[3/2]`, explicit "After — AI concept" label) and collapses originals
    into a smaller "Before — what you have today" strip (`grid-cols-3/4`); a single image
    with no original renders full card width instead of half-empty.
  - `DiffPair` only shows the struck before + rust diff when the before genuinely shares
    words with the after; otherwise (e.g. the derived excerpt is an unrelated blob) it drops
    the fake before and renders the new copy clean near-black under a "New" tag — rust now
    only marks real added words.
  - `Lightbox` gives the image a `w-full max-w-4xl … object-contain` frame so low-res
    originals scale UP to a uniform large size instead of floating in the void.
  - `BeforePanel` fallback: larger 2-col ~200px photo grid + a "Weak spots" callout (no
    headline / no CTA / no photos, derived from the extracted page) so Before reads as a
    convincingly weak real page.
  - `AfterPanel` hero H1 clamp capped (`clamp(2.25rem,4.5vw,4rem)`) + `break-word` so a long
    German compound never clips the ~720px column at a 50% split.
  - Evidence recaptured at 1x (incl. shrinking `08-image-lightbox.png` from ~4MB to ~0.45MB);
    added `07c-single-image.png` (single-image hero) and `10-preview-split.png` (Before weak
    spots + non-clipping After H1). Gates green — `tsc --noEmit`, `pnpm test` (307),
    `pnpm build`.
- **Design review round 2 (2026-07-21): APPROVE.** Independent Apple-lens design critic
  re-verified main @2d02aec visually (1440×900 + mobile): all six round-1 findings landed,
  no regressions; the after-as-hero / before-as-cluster image reveal restructure carried
  the showcase to the one-glance before/after bar. Review loop closed after 2 of max 3
  rounds.

## FEA-107 — Landing hero: imperative customer-acquisition hook copy

- **Status:** BUILT (2026-07-21, branch `feat/fea-107-hero-hook-copy`)
- **Source:** human feedback 2026-07-21 (follow-up to FEA-105): the dominant statement is
  prominent enough but not magnetic — it must promise CUSTOMERS, imperatively.
- **Decision (Mission Control, ad-master pass):** primary headline
  **"Shine online. Win more customers."** Alternates recorded for human swap:
  "Get found on Google. Win more customers." / "Turn your online presence into
  customers." Subline: "We audit how customers see you — on Google, Maps, and your
  website — and fix it in one click."
- **Acceptance:** hero headline replaced with the primary line (two imperative beats,
  customer outcome explicit); subline carries the mechanism; FEA-105 hierarchy preserved
  (headline dominant near-black, slogan stays a small eyebrow, two-line start guide
  intact).
- **Owned paths:** `app/page.tsx`.
- **Result (BUILT):** `app/page.tsx` hero H1 = "Shine online. Win more customers.", subline
  = "We audit how customers see you — on Google, Maps, and your website — and fix it in one
  click." FEA-105 hierarchy untouched (dominant near-black H1, "From Zero to Hero" eyebrow,
  two-line start guide). Evidence: `docs/evidence/redesign-20260721/11-landing-hook.png`.
  Gates green — `tsc --noEmit`, `pnpm test` (307), `pnpm build`.

## FEA-108 — Channel-themed diagnostic modules with UI-built Google mockups

- **Status:** BUILT (2026-07-21, branch `feat/fea-108-diagnostic-modules`)
- **Source:** human feedback 2026-07-21: recommendations are an undifferentiated flat
  list; users cannot tell which advice targets the website vs Google Maps vs photos/
  reviews. Wanted: modular category blocks, per-category visual theming, and GRAPHICAL
  diagnosis — pure UI mockups (no image generation) with defects flagged in place.
- **Acceptance:**
  - Report recommendations regrouped into visually separated category modules mapped
    from existing channel data (render only categories that have content): Google
    Business Profile / Maps · Google Search presence · Website · Photos & Reviews.
  - Each module visibly themed within the design system (e.g. Google-palette accents +
    pin motif for the Maps module; SERP look for Search) — accents only, still one
    product.
  - **GBP listing mock:** a CSS-built Google-Maps-style business panel filled with the
    business's REAL audit data (name, rating stars, review count, category, phone,
    website, hours, photos). Every weak/missing field is marked AT ITS SPOT in the mock
    (e.g. red flag on missing hours, low rating, thin reviews) and paired with concrete
    expert advice (how to earn reviews, how to reply, what to fill in). Missing evidence
    renders as explicitly missing — never invented values (truth discipline).
  - **Website module:** existing before-screenshot on the left, prioritized advice on
    the right. **Search module:** a SERP-snippet mock (title/URL/description) built from
    real evidence with weaknesses annotated.
  - No image generation anywhere in this feature; pure components. Desktop two-column
    inside modules where warranted; mobile stacks cleanly.
- **Owned paths:** `components/report/**`, `components/primitives/*`, `app/audit/**`,
  `app/globals.css` (serialized — frontend sole writer), frontend-owned mapping utils +
  tests. `lib/schemas.ts` FROZEN — consume existing report/evidence fields only.
- **Result (BUILT):**
  - Mapping util `lib/client/reportCategories.ts` (categoryOfChannel / groupChannelsByCategory
    / CATEGORY_META) + `tests/reportCategories.test.ts` (5 cases). `app/globals.css` gains
    muted Google accent tokens (`--color-google-blue/green/yellow/red`), used only inside the
    mocks.
  - `components/report/DiagnosticModules.tsx` replaces the flat `ChannelList` (deleted): it
    regroups channels into four themed modules — Google Business Profile & Maps (red pin),
    Google Search (blue), Website, Photos & Reviews — rendering only categories with content
    and keeping the full improve bookkeeping (postImprove + optimistic state).
  - `components/report/GbpListingMock.tsx`: CSS Google-Maps business panel from real data
    (name, category, rating stars, reviews, phone, website, hours, photos, Maps-listed). Each
    weak/missing field carries a red flag glyph + a "MISSING" word-chip (colourblind-safe) and
    concrete advice; present fields get a green check. `reputation_chips: null` → renders as
    "No rating yet / Missing", never invented.
  - `components/report/SerpMock.tsx`: SERP snippet from real evidence — findability banner
    (not_found → alarm), URL/title/description with "No title tag" / "No meta description"
    annotations, and the real competitors ranking ahead (Tavily results).
  - Website module = "Your site today" health card (before-screenshot when captured, else
    HTTPS/title/meta/Impressum flags from evidence) LEFT / improvable website channels RIGHT
    (desktop two-column, mobile stacks). Data threaded via `app/audit/[id]/page.tsx`
    (business + evidence.website + before_screenshot) → `ReportView` → `DiagnosticModules`.
    `lib/schemas.ts` untouched. No image generation.
  - Evidence (`docs/evidence/redesign-20260721/`, REPLAY): `12-module-gbp.png`,
    `13-module-search.png`, `14-module-website.png`, `15-modules-mobile.png`. Gates green —
    `tsc --noEmit`, `pnpm test` (311, incl. 5 category tests), `pnpm build`.
- **Design review round 1 (2026-07-21) — ITERATE, one P1 resolved on branch
  `feat/fea-108-polish-r1`:** the Website module's "Your site today" left card stretched to
  the full height of the 6-card advice stack (empty space below its URL + chips). Fixed in
  `DiagnosticModules`: the two-column grid is now `items-start` so the left card hugs its
  content, wrapped in `lg:sticky lg:top-[88px]` so it rides alongside the stack on scroll
  (mobile unchanged). Evidence `14-module-website.png` recaptured. Gates green — `tsc`,
  `pnpm test` (339), `pnpm build`. (Critic's two P2s are backend-lane, dispatched separately.)

## FEA-109 — Score visualization: graded red-amber-green bars + row layout polish

- **Status:** BUILT (2026-07-21, branch `feat/fea-109-graded-score-bars`)
- **Source:** human feedback 2026-07-21: the top score area is not vivid enough; needs
  bar-style graphics with alarm-to-healthy color grading, plus a designer pass over the
  text-left / image-right rows.
- **Acceptance:**
  - Score header and per-criterion indicators become graphic bars (or equivalent strong
    visual) with a graded scale: low = alarming red(s), mid = amber/yellow, high =
    healthy green, with gradient transitions between grades; the grade is legible at a
    glance and colorblind-safe (pair color with value/label, not color alone).
  - Palette extends `app/globals.css` tokens (new semantic grade tokens allowed) and
    stays consistent with the warm-paper aesthetic.
  - A deliberate pass over the report's text+image rows: alignment, proportion, and
    emphasis reviewed and tightened (record what changed).
- **Owned paths:** `components/report/**` (esp. `ScoreHeader`, `CriterionBar`,
  `ChannelRow`), `components/primitives/CriterionBar.tsx`, `app/globals.css`
  (serialized), `app/audit/**`.
- **Result (BUILT):**
  - Grade scale: `app/globals.css` gains semantic tokens `--grade-low/mid/high`
    (`#b8462f` warm alarm red · `#b0812e` ochre amber · `#4f7a4f` moss green) + `@theme`
    `--color-grade-*`. Pure grader `lib/client/grade.ts` (`gradeOf` <40/40–70/≥70,
    `GRADE_LABEL` Weak/Fair/Strong, class maps) + `tests/grade.test.ts` (3 cases).
  - `components/primitives/CriterionBar.tsx`: bar fill is now a soft grade gradient; each
    row shows the grade WORD (Weak/Fair/Strong) + `score/max · weight%` so colour is never
    the only signal; `aria-label` includes the grade.
  - `ScoreHeader`: the band is grade-coloured; a new overall red→amber→green **scale bar**
    with a marker at the score + Weak/Fair/Strong axis labels (position + words carry it
    without colour); Text/Images lanes render as graded `LaneScore` bars with word + number.
  - Row tightening (recorded): `ChannelRow` action control now top-aligns with the title
    (was vertically centered → misaligned on the wrapping titles the FEA-108 modules
    introduce); title `leading-snug`, one-liner `mt-1 leading-relaxed` for rhythm.
    `EvidenceHighlights` “Photos to improve” cards use a uniform `aspect-[4/3]` instead of a
    fixed-height 36/64 toggle, so the image column aligns with the quotes column.
  - Evidence (`docs/evidence/redesign-20260721/`, REPLAY): `16-score-graded.png`,
    `17-score-graded-mobile.png`. Gates green — `tsc --noEmit`, `pnpm test` (314, incl. 3
    grade tests), `pnpm build`.

## FEA-110 — After-page services section redesign + curated originals layout

- **Status:** BUILT (2026-07-21, branch `feat/fea-110-services-redesign`)
- **Source:** human feedback 2026-07-21: the services / business-scope block on the
  After page is an unstructured wall of text — unprofessional; and retained old photos
  need deliberate, well-designed placement.
- **Acceptance:**
  - Services/business-scope area redesigned: structured rich layout (e.g. service cards
    or an icon+title+one-liner grid), clear hierarchy, generous spacing — text is fine
    but never an undifferentiated list/blob; consistent with the design system.
  - Originals that backend selection (ISS-017) retains render in a dedicated, purposeful
    block (e.g. "Credentials & real work") with proper sizing/cropping — never scattered
    among generated images; honest labels (Real photo / Certificate vs AI concept).
  - Verified visually in replay; screenshots as evidence.
- **Owned paths:** `components/preview/**` (esp. `AfterPanel`, `ServicesSubpage`),
  `components/report/**` (Before/After inline), `components/primitives/*`.
- **Linked:** ISS-017.
- **Result (BUILT):**
  - Services redesigned (`AfterPanel` home + `ServicesSubpage`): the border-t text rows are
    now structured service cards — a numbered ink badge + title + one-liner in bordered
    Cards under a "What we do / Services" header, generous spacing, never a text wall.
  - Curated originals: `AfterPanel` splits `preview.gallery` by label — AI concepts stay in
    "Our work" (badged), and retained REAL photos (label null) render in a NEW dedicated
    "Credentials & real work" block ("Real photos from your business") with a camera-icon
    "Real photo" label, uniform `aspect-[4/3]` sizing, and click-to-zoom. Originals are no
    longer scattered among generated imagery; `ServicesSubpage`'s work gallery likewise shows
    concepts only.
  - ISS-017 tolerance: `AssetLookup` gained an optional `reason`; `app/audit/[id]/preview`
    reads `meta_json.selection_reason` (with `keep_reason`/`reason` fallbacks) defensively.
    Absent in the replay fixture → the block degrades gracefully to "Real photo" with no
    reason; when the backend lands reasons they render as "· <reason>" after the label.
    `lib/schemas.ts` untouched; no image generation.
  - Evidence (`docs/evidence/redesign-20260721/`, REPLAY After panel): `18-after-services.png`,
    `19-after-credentials.png`, `20-after-services-mobile.png`. Gates green — `tsc --noEmit`,
    `pnpm test` (314), `pnpm build`.

> **Design review — 2026-07-21 batch (FEA-107/108/109/110 + ISS-015…020):**
> round 1 ITERATE (3 findings: website-module stretch → fixed in feat/fea-108-polish-r1;
> garbled enhanced + duplicate source → ISS-019; novelty images as credentials →
> ISS-020); round 2 **APPROVE** — all fixes visually verified on a fresh replay
> (`c96c218b`), no regressions; stale-sample hazard registered and resolved as ISS-021.
> Loop closed after 2 of max 3 rounds.

---

## FEA-111 — Global one-click "optimize everything" CTA with live progress and failure recovery

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-111-one-click-optimize-all`)
- **Source:** human requirement 2026-07-21 — "every sub-item keeps its own Do It For You,
  but there must also be ONE obvious global button that optimizes everything at once, with
  progress, per-item states, and a summary if something fails."
- **Why:** the report lists 7+ improvable items. A visitor who agrees with the whole
  diagnosis should not have to click seven small buttons and guess when it is done. The
  ten-second takeaway of the demo is "one click turns this business from zero to hero".
- **Acceptance:**
  - Per-item "Do It For You" / "Improve It" buttons are untouched and keep working.
  - A single global primary CTA sits at the top of the action list, visually unmistakable
    against the small per-row buttons: large, filled with the primary ink colour, icon-led,
    with copy that states the promise ("Do It All For You — optimize everything").
  - While running, the CTA shows real progress ("Optimizing… 3 of 7 done") derived from
    actual channel state, not a timer; each channel card shows its own
    loading / done / failed state (already driven by the 1s poller).
  - One failing item never blocks the rest; failed items keep the existing honest
    degradation copy.
  - On finish, a summary states what happened ("6 done · 1 could not be finished") and
    offers a retry limited to the failed items.
  - Nothing is faked: progress and the summary are computed from `channels[].status`, and
    a channel that the engine could not improve stays visibly unfinished.
- **Orchestration decision (FACT, from reading the existing chain):** the per-item button
  and the global button share ONE endpoint, `POST /api/audits/:id/improve`, which already
  accepts either a channel-id array or `"all"`
  (`components/report/improveApi.ts` → `app/api/audits/[id]/improve/route.ts`). That route
  flips the audit to `improving` before responding, so a *second* concurrent POST is
  rejected with 409 — front-end fan-out (one request per channel) is therefore impossible
  by contract. The correct orchestration is a single request carrying the explicit list of
  unfinished channel ids; `lib/improve/orchestrate.ts` owns the internal
  concurrency (text channels batched, image generation already parallelized under ISS-006)
  and marks each channel `improving → improved`, or back to `todo` on failure, so per-item
  progress and per-item failure are both observable from the poll response. Sending the
  explicit list rather than `"all"` is what lets the UI know its own target set and
  therefore compute "3 of 7" and "which ones failed".
- **Owned paths:** `components/report/ActionStrip.tsx`,
  `components/report/improveAllState.ts` (new pure progress/summary reducer),
  `tests/improveAllState.test.ts`. No `lib/**` changes.
- **Linked:** F-045 (improve route), F-069 (original action strip), ISS-006/ISS-007
  (image-generation timeouts — a slow image channel is the expected failure mode here).

- **Result (BUILT → VERIFIED):**
  - `components/report/ActionStrip.tsx` rewritten around the global CTA: `h-14 px-8`
    text-[17px] filled-ink pill with a `Sparkles` icon and a drop shadow — visibly a
    different weight class from every per-row button on the page. Copy states the promise
    ("Do It All For You") and the supporting line tells the visitor the per-item buttons
    still work.
  - Progress, failure detection and all button/summary copy live in the new pure module
    `components/report/improveAllState.ts`; the component only renders it. Progress is
    computed from `channels[].status` against the launched target set — never a timer.
  - States: idle → `Optimizing… N of M done` (+ an `aria-live` "N of M finished" line)
    → summary. On partial failure the CTA becomes `Retry K unfinished` and re-posts ONLY
    the failed ids; the summary says "`N` done · `K` could not be finished. Nothing was
    faked in their place." Per-channel loading/done states were already driven by the 1s
    poller (`ChannelRow`) and are untouched.
  - No `lib/**` change; no new endpoint — the existing `POST /api/audits/:id/improve`
    carries the explicit id list.
- **Acceptance evidence (real end-to-end run, dev server, REPLAY audit
  `2a8bfbf5-ed46-4e50-b402-b29e1f8ed10b`, 2026-07-21):** report page showed
  "10 improvements will make the biggest difference." with the global CTA; one click moved
  it to "Optimizing… 0 of 10 done" while the audit status was `improving`; the run settled
  at `complete` with 10/10 channels `improved` and the strip closed with "All 10
  improvements are done." plus a disabled "Everything is optimized" button and the
  "Your new page is ready" bar. Screenshots: `fea-111-idle`, `fea-111-running`,
  `fea-111-summary`.
- **Truth note (ASSUMPTION → not yet observed live):** the partial-failure path (retry
  button + "K could not be finished") is covered by `tests/improveAllState.test.ts` but was
  not reproduced in a live run, because this REPLAY run improved all 10 channels
  successfully. The failure semantics it relies on ("the orchestrator resets a channel it
  could not improve back to `todo`") are FACT, read from `lib/improve/orchestrate.ts:188`.
- **Gates:** `tsc --noEmit`, `vitest run` (26 files / 397 tests), `next build` — all green.

---

## FEA-112 — Asynchronous image generation (report first, images stream in)

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-112-async-image-generation`)
- **Source:** human decision 2026-07-21, overriding ISS-027's model swap: **gpt-image-2
  stays** (quality), and its latency is to be solved by the FLOW, not by changing models.
- **Why:** image generation was the only thing making "Do It For You" feel broken. It is
  also the only part of the run that nobody has to wait for — the report, the rewrites and
  the optimized page are useful the moment the text lands.
- **Research (FACT, measured on this account 2026-07-21, gpt-image-2, same key/prompt):**
  | call | mode | result |
  |---|---|---|
  | 1536x1024 medium | streaming (`stream: true`, `partial_images: 1`) | accepted 11.5s · first partial **12.8s** · final **44.2s** |
  | 1024x1024 low | streaming (`partial_images: 2`) | first partial **13.4s** · final **20.0s** |
  | 1536x1024 medium | non-streaming control | final **38.5s** |
  | 1536x1024 medium | non-streaming (ISS-027 measurement, earlier the same day) | **>500s, never returned** |
  The official fast path is the images API's own streaming mode
  (developers.openai.com image-generation guide: `stream: true` + `partial_images` 0–3);
  the Responses API `background: true` mode is for text responses, not images, so it was
  not used. **The decisive finding is the last two rows: the same call took 38.5s once and
  >500s another time.** gpt-image-2 latency is highly VARIABLE, so no fixed total timeout
  can separate "slow" from "dead" — but a streamed call shows its first partial in ~13s,
  which can.
- **Acceptance (all met):**
  - The audit reaches `status: "complete"` with a valid `preview_json` WITHOUT waiting for
    any image; image channels stay `improving`, which the report already renders as an
    honest "generating" state.
  - Each image lands on its own: channel updated, preview re-assembled, progress event with
    the real duration. No big-bang reveal at the end.
  - A streamed partial image is published immediately (real asset, `label: "ai_concept"`,
    `meta.partial: true`) and REPLACED IN PLACE by the final frame — same asset id, same
    path, so refs taken early stay valid and the image cap still counts one image.
  - The model is never switched. The ISS-027 retry survives as one same-model
    `quality: "low"` retry.
  - Nothing is faked: a partial that never gets its final frame keeps
    `meta.partial_only: true` + `final_error`, and a channel with no image at all still
    reports `generation_error` through the ISS-028 provenance contract.
- **Design:**
  - `lib/improve/image.ts` — `callImageWithDowngrade` now streams (`OPENAI_IMAGE_STREAM=0`
    opts out) and guards the stream PER EVENT with `OPENAI_IMAGE_STALL_TIMEOUT_MS`
    (default 120s) on top of the total `OPENAI_IMAGE_TIMEOUT_MS` (default raised
    120s → **900s**). Silence, not elapsed time, is what now means "dead". `onPartial`
    publishes the first partial.
  - `lib/improve/orchestrate.ts` — `assembling_preview` + `status: "complete"` moved
    BEFORE `await Promise.allSettled(imageWork)`; `refreshPreview()` re-assembles on every
    partial/final landing; a final refresh + `done` closes the run.
  - `lib/improve/preview.ts` — an `improving` channel that already carries a
    `generated_asset_id` (its own streamed partial) is used as a genuine `generated` image,
    flagged `generation_pending`.
- **Contract for the frontend lane (new, additive):**
  - `GET /api/audits/:id` → **`images_pending: number`** — image-lane channels still
    `improving`. `status: "complete"` no longer means "images done"; keep polling (and keep
    showing the generating state) while `images_pending > 0`.
  - `preview_json.hero` / `.about_team` → **`generation_pending?: boolean`** — the image
    shown is this run's real streamed partial; a sharper final frame is still coming.
    Existing `image_source` / `generation_error_reason` (ISS-028) are unchanged.
  - Progress steps now legitimately repeat: `rewriting_text → generating_images →
    assembling_preview → generating_images(details) → assembling_preview → done`.
- **Owned paths:** `lib/improve/image.ts`, `lib/improve/orchestrate.ts`,
  `lib/improve/preview.ts`, `lib/schemas.ts` (optional additions only),
  `app/api/audits/[id]/route.ts`, `tests/improve.test.ts`, `tests/api.test.ts`.
- **Verification (real end-to-end run, LIVE, gpt-image-2, real site
  `https://www.muster-sanitaer.example/`, audit `5204bac4-3727-400e-8b7c-b4a98ecf1f72`):**
  analyze finished at 27.7s → **report + preview complete at 32.7s with
  `images_pending: 3`** (hero honestly `image_source: "harvested_fallback"`,
  `generation_pending: true`) → partials published at **11.0s / 13.0s / 16.1s** into the
  image stage → finals: `hero_image` **41.7s**, `work_proof_images` **47.5s**,
  `team_image` **62.1s**, all `gpt-image-2/medium`, all replaced in place, final hero
  `image_source: "generated"`. `image_fixes` honestly reported "only small logos, nothing
  to enhance". Gates green: `tsc --noEmit`, `vitest run` (419), `next build`.
- **Regression guards:** `tests/improve.test.ts` — "FEA-112: the report and preview complete
  while images are STILL generating" (image calls held open; asserts `complete` + valid
  preview + `hero_image` still `improving` + zero generated assets, then release and assert
  completion) and "FEA-112: a streamed partial image is published against the channel and
  replaced in place by the final frame" (asserts one asset, `partial: true`, channel ref,
  then same id with `partial_ms` and no duplicate row).

---

## FEA-113 — `pnpm smoke:api`: a 30-second live check of the three provider calls

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-113-api-smoke-test`)
- **Source:** human requirement 2026-07-21, alongside the decision to keep gpt-image-2:
  "there must be a fast way to test the APIs".
- **Why:** every provider incident so far (ISS-027's timeouts, a missing key, a model the
  account cannot use) cost minutes of guessing inside a full audit run. One command must
  answer "keys? model access? how slow is it right now?" before the demo, not during it.
- **Acceptance (all met):**
  - `pnpm smoke:api` exercises, in parallel, ① a real chat completion on
    `OPENAI_MODEL_TEXT`, ② a real image generation on `OPENAI_MODEL_IMAGE`, ③ a real Tavily
    search — the actual call shapes the product uses, no fixtures.
  - Each line reports ok/fail, real latency, and on failure a NORMALIZED reason:
    `missing_key | invalid_key | no_model_access | rate_limited | timeout | network |
    provider_error | unknown`.
  - Finishes inside ~30s even though a full gpt-image-2 render takes ~40s: the image check
    streams and stops at the FIRST frame, aborts the render, and says so in its own output
    ("full render NOT awaited") rather than implying a finished image.
  - No key material is ever printed — including the masked key providers echo back inside
    their own error text, which is redacted to `<redacted>`.
  - Exit code 0 only when all three pass, so it is usable as a pre-demo gate.
- **Model decision landed here (human, 2026-07-21):** `OPENAI_MODEL_IMAGE` is back to
  **gpt-image-2** — in `.env`, `.env.example`, and the `lib/agents/openai.ts` default —
  chosen for quality. ISS-027's swap to gpt-image-1 is reverted; the timeout problem it was
  fighting is solved by FEA-112's asynchronous streamed flow instead. Both the env comment
  and the code comment state this, so nobody "fixes" a future timeout by swapping models
  again.
- **Owned paths:** `scripts/smoke-api.ts` (new), `package.json` (one script line),
  `.env.example`, `lib/agents/openai.ts`, `docs/FEATURES.md`.
- **Verification (real runs, 2026-07-21):**
  - All good: `✓ openai.text 1.4s gpt-5.6-luna → "ready"` · `✓ openai.image 9.9s
    gpt-image-2 1024x1024/low → first partial frame received (full render NOT awaited)` ·
    `✓ tavily.search 2.5s search → 1 result(s)` — **3/3 in 9.9s**, exit 0.
  - Bad keys: all three fail in 0.6s as `invalid_key`, exit 1.
  - Wrong model (`OPENAI_MODEL_IMAGE=gpt-image-99`): text/search stay green,
    `✗ openai.image no_model_access: 400 The model 'gpt-image-99' does not exist.`, exit 1.
  - Key redaction confirmed: the provider's echoed key renders as `<redacted>`.
  - Gates green: `tsc --noEmit`, `vitest run` (419), `next build`.
- **Regression guard:** the script is its own guard — it is a live check, so a unit test
  would only assert its formatting while mocking away the thing under test. Run it before
  any demo; a red line names the reason.

---

## FEA-114 — Image content taxonomy, composition quotas, and gap-filling generation

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-114-image-taxonomy-composition`)
- **Source:** human review 2026-07-21 with a screenshot: the After page's "Our work"
  gallery showed four images, **three of them the team standing in front of the van**.
  Requirement: manage image content the way a marketing director and a top-tier web
  designer would — classify what each picture shows, give each page slot a quota, and stop
  generating more of what the business already has.
- **Why:** the product's promise is a page a customer would trust. Three near-identical
  people-shots is exactly what an amateur page looks like, and it was structural: nothing in
  the system knew what an image CONTAINED, so ranking alone decided every slot and the
  generator happily produced a third team photo for a business that already had team photos.
- **Design (data-driven, not hardcoded rules):**
  - **`lib/images/taxonomy.ts` (new)** — the shot list as data. `ImageCategory` =
    `storefront | team | work_result | craft_detail | credentials | equipment | other`
    (deliberately loose; unclear images are honestly `other`, never force-fit). A
    `CompositionPolicy` per trade carries `hero_priority`, `team_priority`,
    `gallery_priority`, per-category `gallery_quota`, and `generation_targets`; trades
    override only what differs (a doctor's practice leads with premises and has no
    "finished jobs"; a roofer's gallery allows four results). Adding a trade means adding a
    policy object.
  - **Classification** — `runImageClassifier` (`lib/agents/experts.ts`) reuses the Visual
    Director's batching and its already-prepared data URLs: one extra structured vision call
    per batch, same images. Results are persisted on each asset's `meta_json` as
    `content_category` / `_confidence` / `_source` / `_rationale`. A failed call is not
    fatal and not hidden — every asset falls back to a deterministic keyword heuristic
    labelled `source: "heuristic"`, and a progress event says the classifier was unavailable.
  - **Composition** — `selectGallery` fills slots ROUND-ROBIN in the trade's priority order
    under the per-category quota, so the gallery is diverse by construction rather than
    "whatever ranked highest". `selectSlot` fills hero/about from the right KIND of image
    (a hero wants premises or finished work; the about slot wants the people) instead of one
    global "best photo". This run's own generated images that could not be classified are
    quota-exempt (ISS-017 new-by-default: a quota exists to stop duplicates, and an
    unclassified new image cannot be proven duplicative).
  - **Gap-filling generation** — `planImageGeneration` plans ALL image channels together,
    before any of them runs, in two passes: each channel gets first refusal on its own
    category, then any channel whose category is already covered by the business's real
    photos is redirected to the most valuable REMAINING gap, and if nothing is missing it
    skips honestly (`skipped_reason` on the channel, not an error). Two channels can never
    claim the same category. `credentials` is never generated — an invented certificate
    would be a lie. New prompt variants (`storefront`, `craft_detail`, `equipment`) exist so
    a gap can actually be filled.
- **Acceptance (all met, verified live):**
  - Every harvested/uploaded asset carries a persisted category with a confidence and an
    honest source; unclassifiable → `other`; classifier failure → heuristic, never a block.
  - The gallery holds at most ONE team image (per-trade quota) and prefers business-value
    categories; remaining slots go to different categories before a second of any.
  - The generator never produces a category the business already has real photos of.
  - Slot decisions are auditable: `preview_json` carries `gallery[].category` and
    `hero/about_team.image_category`, `explainComposition()` reproduces the reasoning, and
    the run's progress events record both the generation plan and the final composition.
- **Contract for the frontend lane (new, additive, optional):**
  `preview_json.gallery[].category`, `preview_json.hero.image_category`,
  `preview_json.about_team.image_category` — the category each slot was filled from, for
  labelling/grouping. Channel `after_json` may now carry `content_category` and
  `skipped_reason` (a deliberate non-generation, not a failure).
- **Owned paths:** `lib/images/taxonomy.ts` (new), `lib/agents/prompts.ts`,
  `lib/agents/experts.ts`, `lib/pipeline/orchestrator.ts`, `lib/improve/image.ts`,
  `lib/improve/orchestrate.ts`, `lib/improve/preview.ts`, `lib/schemas.ts` (optional
  additions only, same standing approval as ISS-028/FEA-112), `tests/taxonomy.test.ts` (new).
- **Verification (real end-to-end run, LIVE, gpt-image-2, `https://www.muster-sanitaer.example/`,
  audit `39e58084`):** all 8 harvested photos classified by vision with 0.90–0.98
  confidence (5× `work_result`, 3× `craft_detail`, each with a concrete rationale). The
  planner then reported: `hero_image → work_result` ("hero slot always gets its own headline
  image"), `team_image → team` ("no real team photo exists yet"), `work_proof_images →
  storefront` ("work_result is already covered by the business's own photos — redirected to
  the missing storefront"). Final composition: `hero=work_result`, `about_team=team`,
  gallery = `work_result`, `storefront`, `team` — **3 tiles, 3 distinct categories, exactly
  one team image** (the reported defect was 3 of 4). Gates green: `tsc --noEmit`,
  `vitest run` (434), `next build`.
- **Observation (not a defect of this feature):** in that run the gallery contained only
  newly generated images — the business's 8 originals were excluded earlier by ISS-017's
  new-by-default curation gate (score/size), before composition ever sees them. The quota
  logic applies to originals identically once they clear that gate.
- **Regression guards:** `tests/taxonomy.test.ts` (15 cases) — "THE BUG: four team photos
  can no longer fill the gallery", per-trade quota repetition, generated-image exemption,
  doctor-vs-plumber priority, slot selection, and the planning cases: a covered category is
  never regenerated, a missing one is, everything covered → honest skip, `credentials` is
  never a generation target, and a generated concept never counts as evidence the business
  HAS that category.

---

## FEA-115 — Report page shows the streamed partial while an image is still generating

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-115-report-partial-frames`)
- **Source:** raised by the frontend lane while verifying ISS-032 (2026-07-21) and approved
  by Mission Control the same day. FEA-112 publishes a real streamed partial within
  ~12-24s and the preview page shows it, but the REPORT page rendered nothing for an image
  channel until it reached `improved` (~40-60s) — a spinner held over a picture that was
  already in the database. Not a defect (the row never claimed anything false), so it is
  registered here rather than in `docs/ISSUES.md`.
- **Why:** the whole point of streaming partials is that the visitor sees progress early.
  That payoff was only being collected on one of the two pages that show imagery.
- **Acceptance:**
  - While a channel is `improving` AND a `generated_asset_id` has been published, the row
    shows that frame instead of nothing.
  - The frame is always labelled as early — the ISS-032 wording, "Sharpening — a clearer
    version is on its way" — and is never presented as the finished result.
  - The FEA-114 category chip (ISS-033) renders beside it when the channel carries a
    `content_category`.
  - When the final frame lands, the row flips to the existing full reveal with no visual
    break: the final overwrites the SAME asset id and path, and ISS-032's mtime stamp makes
    the browser re-fetch it.
  - No double-render: an `improved` channel keeps the existing `BeforeAfterInline` reveal
    and never also shows an early frame.
  - A channel improving with no image yet still shows the plain loading state.
- **Owned paths:** `components/report/partialFrame.ts` (new),
  `components/report/ChannelRow.tsx`, `components/report/BeforeAfterInline.tsx` (export
  `buildAssetLookup`), `tests/partialFrame.test.ts` (new). No `lib/**` change.
- **Linked:** FEA-112 (partial publication), ISS-032 (poller + in-place cache-bust that
  make the swap visible at all), ISS-033 (category chip).

- **Result (BUILT → VERIFIED):**
  - `components/report/partialFrame.ts` (new, pure) answers "is there an early frame to show
    right now?" — requires BOTH `status === "improving"` and a published
    `generated_asset_id`, and additionally that the asset row is readable in this render
    (ISS-032: the poll payload and the server-rendered asset list refresh independently, so
    the id can be known a beat before the row is). It deliberately does NOT require
    `partial: true`: a published asset on an improving channel IS an early frame, and
    treating a missing flag as "not partial" would hide the very image this exists for.
  - `ChannelRow` renders that frame with the ISS-032 wording ("Sharpening — a clearer
    version is on its way") plus the ISS-033 category chip. `buildAssetLookup` is now
    exported from `BeforeAfterInline` so both paths resolve assets identically (id, then
    the fixture-derived `ref`).
- **Verification (controlled reproduction, production build + `next start`; no new LIVE run
  — Mission Control directed the remaining budget elsewhere).** The in-flight state was
  reproduced on the real LIVE audit `e18fadac-…` by putting `hero_image` back to
  `improving` with `partial: true` over its real published asset — the exact row shape
  FEA-112 writes (verified against the API: `generated_asset_id`, `partial: true`,
  `content_category: "work_result"`, `images_pending: 1`):
  - **Improving:** the row rendered the real generated frame with the "Sharpening — a
    clearer version is on its way" chip and a "Work result" category chip, instead of the
    previous empty spinner row. Screenshot `fea-115-report-partial-frame`.
  - **Seamless swap:** flipping the channel to `improved` with the page left open (no
    reload) removed the chip and handed the slot to the existing full reveal — "Improved /
    Hide result / NEW — AI CONCEPT" — with **exactly one** hero image in the DOM, i.e. no
    double-render between the early-frame block and `BeforeAfterInline`.
  - The channel row was restored afterwards and re-verified (`improved`, no `partial` flag).
  - **Not observed live (ASSUMPTION):** the sub-second visual continuity of the real
    partial→final pixel swap on the REPORT page. Its mechanism is the same one already
    proven live on the preview page in ISS-032 Verification 3 (same asset id, same path,
    mtime-stamped URL).
- **Gates:** `tsc --noEmit`, `vitest run` (32 files / 452 tests), `next build` — all green.

---

## FEA-116 — The business's name leads the generated site

- **Status:** VERIFIED (2026-07-21, branch `feat/fea-116-brand-name-prominence`)
- **Source:** human 2026-07-21 — "the logo/name should be bigger and visible on every page"
  of the generated After site.
- **Why:** the After page's hero headline was the model-written business DESCRIPTION
  ("Heizung Lüftung Sanitär - Meisterbetrieb") and the business's own name appeared only as
  small header text — and not at all on the Services page, which ended with no name on it.
  A visitor could scroll a whole page without learning whose site they were on.
- **Acceptance:**
  - Hero leads with the business name; the model-written line keeps its weight directly
    underneath (nothing removed, only re-ordered).
  - Header brand slot is larger and is a real link home, on every page.
  - A footer carrying the name closes EVERY page, with phone / legal lines when the audit
    actually has them.
  - Names of any length survive: no horizontal overflow, including in the ~50%-wide split
    pane at a narrow viewport.
  - Nothing invented: an audit with no business name renders no brand lines at all.
- **Owned paths:** `components/preview/brandName.ts` (new),
  `components/preview/AfterPanel.tsx`, `tests/brandName.test.ts` (new). No `lib/**` change.
- **Result (BUILT → VERIFIED):**
  - Hero: `h1` is now the name, sized by `heroBrandNameClass()` in three tiers (≤18 / ≤34 /
    longer characters), each still a viewport `clamp()`. `hero.h1` follows as a
    `clamp(1.25rem,2.6vw,1.75rem)` statement line, `hero.subline` under it.
  - **The name is NOT hyphenated.** `hyphens-auto` (inherited from the old headline styling)
    split it mid-word — "M. Mustermann sani-tary engineering". A name wraps between words and
    only breaks inside a word if a single token is genuinely wider than the column.
  - Header: `text-sm` → `text-[17px] sm:text-[19px]`, semibold, `truncate`, wrapped in a
    `Link` to the home page.
  - Footer: hoisted OUT of the home-only branch so Home and Services both get it — name,
    then phone (when known), then the Impressum/Datenschutz lines (when the audit found
    them). Previously the Services page had no footer at all.
  - `resolveBrandName()` returns null for absent/blank/non-string, so nothing like "Your
    business" is ever printed as if it were the real name.
  - **Gotcha found and fixed (worth knowing):** `cn()` runs tailwind-merge, which treats
    `text-[clamp(...)]` as the font-size/line-height shorthand and **silently drops a
    `leading-*` written before it**. The hero shipped at 1.5 line-height until the size
    class was moved ahead of the leading class. `tests/brandName.test.ts` now pins both
    orders so a reorder fails loudly instead of quietly loosening the display type.
- **Verification (production build + `next start`):**
  - Desktop 1440×900, audit `e18fadac-…`: hero reads **Rost & Weber GmbH** as the dominant
    line with the description beneath (`fea-116-home-desktop-final`); header brand enlarged.
  - Footer present on Home (`fea-116-footer-after-mode`) AND on Services
    (`fea-116-services-footer`) — the Services page previously had none.
  - Narrow 420×860 with the longest name available ("M. Mustermann Haustechnik",
    audit `066116d9-…`) inside the ~50% split pane: wraps between words, computed
    `line-height 30.4px` at `font-size 32px`, `hyphens: manual`, and
    `documentElement.scrollWidth === innerWidth` — i.e. **no horizontal overflow**
    (`fea-116-narrow-long-name-fixed`).
  - Gates: `tsc --noEmit`, `vitest run` (33 files / 473 tests), `next build` — all green.

---

## FEA-117 — The gallery always holds at least four DIFFERENT images

- **Status:** VERIFIED (2026-07-22, branch `feat/fea-117-gallery-minimum-four`)
- **Source:** human decision 2026-07-21, ruling on the trade-off ISS-035 surfaced: dedup
  made the After page honest but nearly empty (Muster + Sohn was down to a single tile).
  "Our work" must show **at least 4** images.
- **Why this business had nothing to show (FACT, measured):** all eight of Muster + Sohn's
  real photos are **120×120 thumbnails**, and the two uploads are a Google-listing
  screenshot. ISS-017's showcase gate excludes every one of them, correctly. There is no
  honest way to reach four from the business's own material — the gap can only be filled by
  generating new, clearly-labelled AI concepts.
- **Acceptance (all met):**
  - `CompositionPolicy.gallery_min` (default **4**, every trade) is the floor.
  - When curation + lineage dedup leave fewer tiles than that, the planner adds EXTRA
    generations — never copies, never another angle of a scene already shown.
  - Every filler differs from the rest by category or by concrete subject; the subject is
    written into the prompt ("must show X specifically, visually DISTINCT from the other
    images — different room, service, angle") and into the asset's `generation_subject`.
  - `team` stays capped at one page-wide; `credentials` is still never generated.
  - Fillers stream and land exactly like FEA-112 channel images (partials, per-image
    preview refresh, honest timing telemetry).
  - Filling is bounded: `MAX_GALLERY_FILLERS = 4`, only on a full "Do It For You" run
    (improving a single channel never triggers extra generations), and only for as many
    distinct subjects as the business actually has.
- **Design:** `planGalleryFillers` counts what the gallery will really contain under the
  rules that run at assembly time — originals that clear ISS-017, lineages collapsed
  (ISS-035), and hero/about consuming their own images without contributing a tile — then
  plans the shortfall: first whole shot-list categories nobody covers, then extra
  `work_result`/`craft_detail` shots anchored to DISTINCT real services. `selectGallery`
  additionally enforces subject-distinctness, so a category may only repeat with a
  different subject. The image caps rose (`CONCEPT_IMAGE_CAP` 3→8, `GENERATED_IMAGE_CAP`
  5→10) — budgets, not targets: a run still generates only what the gap analysis asks for.
- **Owned paths:** `lib/images/taxonomy.ts`, `lib/improve/image.ts`,
  `lib/improve/orchestrate.ts`, `lib/improve/preview.ts`, `lib/agents/prompts.ts`,
  `tests/taxonomy.test.ts`, `tests/improve.test.ts`.
- **Verification (real end-to-end LIVE run, gpt-image-2, `https://www.muster-sanitaer.example/`):**
  analyze 24.7s, improve complete at 83.3s. Planner log: `hero_image → work_result`,
  `team_image → team`, `work_proof_images → storefront`, then
  `gallery_filler_1 → work_result "Bad"`, `gallery_filler_2 → craft_detail
  "Heizungsinstallation"`, `gallery_filler_3 → work_result "Rohrreinigung"` — each with
  its distinct-subject reason recorded. Result: **gallery = 4 tiles, 4 distinct lineages,
  4 distinct category:subject pairs** (`work_result:rohrreinigung`,
  `craft_detail:heizungsinstallation`, `storefront`, `work_result:bad`), hero and about
  filled separately and not repeated. Fillers landed in 47.4s / 49.2s / 55.1s with first
  partials at 9.9–12.9s. Gates green: `tsc --noEmit`, `vitest run` (478), `next build`.
- **Regression guards:** `tests/taxonomy.test.ts` — every trade states `gallery_min ≥ 4`;
  "THE CASE: a business whose only photos are 120px thumbnails gets fillers up to the
  minimum" (asserts 3 fillers, distinct identities, no `credentials`); "plans nothing when
  the business already has enough showcaseable photos"; "is bounded — a business with no
  named services cannot spin up unlimited generations"; and "a category may repeat in the
  gallery only with a DIFFERENT subject".
