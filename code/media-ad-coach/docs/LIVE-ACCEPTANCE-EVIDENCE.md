# LIVE acceptance evidence

Recorded on 2026-07-18 from an isolated production build. No credentials or
raw API responses are stored in this document or the committed fixture.

> **Anonymization note (2026-07-22):** the LIVE audit ran against a real Berlin
> plumbing business. For publication, its identity was replaced everywhere in
> this repository with the fictional **"Rohrfuchs Berlin"** persona and
> non-resolving `.example` URLs; harvested photos were replaced with synthetic
> placeholders. See `docs/CONTENT-PROVENANCE.md`. The timings, scores, and
> pipeline facts below are unchanged from the real run.

## Completed audit

- **FACT:** audit `90e9b6c4-ea09-4755-90c3-20621409c660` ran in `LIVE` mode
  against a real Berlin plumber's website (published here under the fictional
  `https://www.rohrfuchs-berlin.example/` / "Rohrfuchs Berlin" persona).
- **FACT:** the audit was created at `2026-07-18T16:00:17.940Z` and reached the
  scored `done` event at `2026-07-18T16:01:15.854Z` (under 60 seconds).
- **FACT:** the deterministic result was `43/100`, band `Weak`, and the final
  audit status was `complete` with a ready preview.
- **FACT:** Tavily ran during the LIVE audit. It returned five corroborating
  search results and the deterministic findability outcome was `not_found`.
- **FACT:** Cognee was disabled because no Cognee URL/key was available. The
  report has no memory line; no memory result was fabricated.

## Screenshot and image provider evidence

- **FACT:** Playwright captured the real target at `1440 × 900` as a 458 KiB
  PNG before scoring. The capture was visually inspected and shows the target
  website, not an application placeholder. To avoid redistributing a full-site
  capture, the repository records its SHA-256 instead:
  `277b9b8a633baea7844fc95a17b2a986b8757f9c277455e7cd42c49e8fb30f92`.
- **FACT:** the pipeline harvested and normalized eight source-site images.
- **FACT:** the provider generated three `ai_concept` assets for
  `work_proof_images`, `hero_image`, and `team_image`.
- **FACT:** three real provider edit calls completed (the original LIVE run and
  two conservative retries). Manual comparison found that every result changed
  factual image content beyond relight/recrop. All three outputs were rejected;
  no `enhanced` asset is included in the committed fixture and F-096 remains
  blocked rather than presenting a generated alteration as a faithful edit.

## Recorded REPLAY fixture

The committed `lib/fixtures/replay-audit.json` and
`public/fixtures/rohrfuchs-berlin-replay/` were produced from the completed LIVE
audit with:

```bash
APP_DB_PATH=<isolated-live-db> APP_STORAGE_DIR=<isolated-live-storage> \
  pnpm exec tsx scripts/record-fixture.ts \
  --audit 90e9b6c4-ea09-4755-90c3-20621409c660 \
  --slug rohrfuchs-berlin-replay
```

- **FACT:** the original recording copied 12 image assets and nine channel
  improvements. For publication, all eight third-party source binaries and the
  rejected edit output were replaced with synthetic gradient placeholders at
  the original dimensions. The publishable fixture keeps three labeled AI
  concepts plus the structured scoring from the eight sources; the image-fixes
  asset records the replacement in its metadata.
- **FACT:** the recorder now rejects non-LIVE audits.
- **FACT:** the recorded report is converted to `REPLAY`, clears
  `memory_note`, and adds an explicit statement that replay makes no live
  partner calls.
- **FACT:** contract tests verify the score, schemas, truth labels, file paths,
  full offline walkthrough, and re-record path.
