# F-102/F-103 rehearsal and recording evidence

**FACT:** Recorded at 2026-07-18 18:36 CEST against the publishable production build checkpoint.

## Truthful scope

- **FACT:** All three automated rehearsals used `DEMO_MODE=replay` with blank OpenAI,
  Tavily, and Cognee keys. They are not LIVE audit evidence and do not claim to be.
- **FACT:** Run 3 rejected all browser requests except `localhost`/`127.0.0.1`. This is a
  repeatable browser-egress isolation drill, not proof that the machine's physical Wi-Fi
  adapter was disabled.
- **FACT:** Each run used a fresh temporary SQLite database and storage directory, plus
  the same snapshotted Next.js production build.
- **FACT:** All three runs, including the recorded run, explicitly visited the normal
  input route and then switched to the REPLAY sample.

## Reproduction

From `code/media-ad-coach/` with Node 22 and Playwright Chromium installed:

```sh
pnpm build
node scripts/rehearse-demo.mjs \
  --runs 3 \
  --record-run 3 \
  --video tmp/f103-demo-replay.webm \
  --results tmp/f102-rehearsal-results.json
```

**FACT:** The script snapshots `.next` before starting the runs, starts a fresh production server
for each run, and records raw machine-readable evidence to the requested JSON path.

## Results

**FACT:** The measured automated results were:

| Run | Network condition | Sample to score | Single Improve It | Improve all | Full walkthrough | Result |
|---|---|---:|---:|---:|---:|---|
| 1 | Local production server; REPLAY; partner keys blank | 2.388 s | 1.365 s | 1.398 s | 8.135 s | PASS |
| 2 | Local production server; REPLAY; partner keys blank | 2.585 s | 1.370 s | 1.387 s | 8.120 s | PASS |
| 3 | Browser egress denied except localhost; REPLAY; partner keys blank | 2.501 s | 1.380 s | 1.337 s | 39.315 s | PASS |

**FACT:** Every run asserted the complete judge path:

1. Landing and truthful `REPLAY SAMPLE` badge.
2. `43/100 — Weak` score plus source-backed quote/photo evidence from the recorded LIVE audit.
3. `Headline & first impression` single-channel improvement and inline before/after.
4. `Do It For You` completion and visible `Your new page is ready` bar.
5. Before/After preview, visible `AI concept` badge, and draggable split divider.
6. Persisted History row with a truthful `REPLAY SAMPLE` badge.

**FACT:** All three runs reported zero console errors, page errors, or non-navigation localhost
request failures. Expected Next.js RSC/EventSource cancellations during navigation were
recorded separately and not treated as failures.

## Demo video

- **FACT:** `tmp/f103-demo-replay.webm`
- **FACT:** WebM, 1440×900, 39.20 seconds, 3,460,789 bytes.
- **FACT:** Chromium loaded the finished file, reported a 39.20-second duration, and
  successfully sought to 18 seconds for a visual frame check.
- **FACT:** The publishable fixture used for this recording excludes all third-party source
  image binaries and the provider edit that failed factual-preservation review.
- **FACT:** The recording carries a persistent
  `REPLAY SAMPLE · OFFLINE-CAPABLE · NOT LIVE` banner and timed walkthrough captions.
- **FACT:** The recording is below the 120-second submission limit.

**FACT:** The video is intentionally kept under the ignored `tmp/` path rather than tracked in Git.
**FACT / BLOCKED:** It still needs a human to upload it to the organizer's chosen video host/submission form.

## Remaining human-only evidence

- **FACT / BLOCKED:** Physical Wi-Fi-off/airplane-mode execution on the presenter machine was not
  performed by automation. Run 3 is the deterministic browser-egress proxy described
  above.
- **FACT:** One isolated production LIVE acceptance run completed successfully with approved
  OpenAI and Tavily credentials; see `docs/LIVE-ACCEPTANCE-EVIDENCE.md`.
- **FACT / BLOCKED:** No venue-network LIVE rehearsal was run, and physical Wi-Fi-off evidence
  still requires the presenter.
- **FACT / BLOCKED:** Video upload, organizer submission, and the submission receipt remain
  external F-104 steps. The public repository itself has been verified.
