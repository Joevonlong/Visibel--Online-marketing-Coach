# Demo runbook — Visibel ("From Zero to Hero")

Owner D prepared this runbook; **the human presenter executes it.** It covers the
preparation half of F-102 (rehearsals), F-103 (video), and F-104 (submission) from
`docs/team-idea/final-implement-plan/impelemet-plan.md` §6.2/§7/§8. Test targets for the
live portion were real Berlin small-business sites scouted by the team before the event;
their identities are withheld from the public repository (see
`docs/CONTENT-PROVENANCE.md`).

---

## 0. Run / Stop

```bash
pnpm demo        # rock-solid offline demo: production build + start on :3000, DEMO_MODE=replay
pnpm demo:live   # same, but LIVE mode (uses .env keys — OpenAI/Tavily/Cognee)
pnpm demo:stop   # kill whatever is listening on :3000
```

`pnpm demo`/`demo:live` always kill anything already on port 3000 first, then build into a
dedicated `.next-build/` directory (separate from `.next/`, which `pnpm dev` uses) and start
from there. This isolation means **it is now safe to run `pnpm build` while a dev server is
up in the same directory** — they write to different `distDir`s and can no longer corrupt
each other. (Previously, a concurrent `next build`/`next dev` pair sharing `.next/` could
delete files out from under the live server mid-request and produce a bare 500 on every
route — see `NEXT_DIST_DIR` in `next.config.ts` and the build/start scripts in
`package.json`.) Still avoid running two `pnpm demo`/`pnpm dev` invocations against the same
port at once — `demo:stop` or a fresh `pnpm demo` handles that for you.

---

## 1. Demo script (~2 minutes)

Beat-by-beat walkthrough with target timings. Total budget 2:00 — this is also the video
shot list's backbone (§3). Rehearse against the fixed checkpoint, never improvised.

| Time | Beat | What happens on screen | What you say |
|---|---|---|---|
| 0:00–0:12 | **Landing** | Full-bleed hero: "Visibel" eyebrow, H1 **"From Zero to Hero."**, subline "Show us your business. See what customers see. Let us fix it." | Ten-second takeaway (verbatim from the plan): *"It looks at your business the way a searching customer does, scores your words and your photos, and then — instead of giving you homework — fixes them for you and shows you the after."* |
| 0:12–0:15 | Click pill CTA | Landing → `/audit/new` | *"Let's show it a real, weak local site."* |
| 0:15–0:35 | **Input page** | Fill 1–2 fields only, live and fast: brand name + trade pill, then paste the primary target's website URL in "Online presence." Leave attachments empty — the product should work from links alone. | *"Just the business name and their existing links — nothing to configure."* |
| 0:35–0:38 | Submit → analyzing | Route to `/audit/[id]`, progress checklist starts | *"It's fetching the site the way a customer's browser would, harvesting the photos, and running two GPT-4o experts on text and images."* |
| 0:38–0:50 | **Analyzing checklist moment** | Progress steps flip live: `reading_site → collecting_images → checking_local_search → recalling_similar_audits → experts_scoring → building_channels → done` | Narrate 1–2 steps as they flip, especially `checking_local_search` — *"that's Tavily checking whether a customer searching '{trade} {city}' can even find them."* |
| 0:50–1:05 | **Score reveal** | Overall number count-up animation, band label, mode badge (LIVE), findability chip | *"[Score]/100 — [band]. And here's the findability chip: [Found / Portals only / Not found] — that's a live search result, not a guess."* |
| 1:05–1:15 | **Channel list** | Scroll to action strip: **"N things stand between you and Hero."** + channel rows (icon, title, one-liner, severity dot, mini before-excerpt) | *"Every row here is backed by an actual quote from their site or an actual photo — click-traceable, not a black box."* |
| 1:15–1:30 | **Click Improve It on `hero_headline`** | Row flips `todo → improving → improved`; inline before→after reveal expands | *"Watch — real before, real after, in place."* Read the before excerpt (the site's actual weak headline) then the after. |
| 1:30–1:40 | **Do It For You** | Click the primary pill at the top of the channel list | Truth-badge talking point (verbatim): *"You approve. We do the work."* — *"This runs every remaining channel and assembles the full page."* |
| 1:40–1:55 | **Before/After preview** | Sticky "Your new page is ready" bar → opens `/audit/[id]/preview` full-screen overlay; drag the split-view divider | *"Every generated image here carries an `AI concept` badge — we never present a generated photo as their real work. This is what the page could feel like; they shoot or supply the real photos, or —"* the paid-next-step line (verbatim): *"'publish this for me' is the paid next step."* |
| 1:55–2:00 | **Close** | Close preview → back to channel list; header line **"{Business} — from Zero to Hero."** | *"From Zero to Hero — in under a minute, for a real business, with receipts for every claim."* |

Cut for time: attachments/image upload, GBP screenshot path, `/history`. If ahead of pace,
add a 5–10 s aside on the Cognee "compared to similar businesses" line if it rendered.

---

## 2. Rehearsal checklist ×3 (F-102)

**Rule: never first-run live on stage.** All three rehearsals happen before the real
presentation slot, against the same fixed checkpoint (post feature-freeze, T+255 per §7).

### Cognee seed gate — before the demo audit (F-092)

This is a real external step, not fixture setup. Configure `COGNEE_API_URL` and
`COGNEE_API_KEY` in the local `.env` (`COGNEE_DATASET_NAME` defaults to
`visibel-audits`; Cognee Cloud uses `X-Api-Key`, while a compatible self-hosted
deployment can set `COGNEE_AUTH_MODE=bearer`). Then:

1. Complete 2–3 distinct **LIVE** audits for businesses with the same trade and city as
   the intended demo audit. Run **Do It For You** on them when possible so the deeper
   Cognee record contains real improved-channel outcomes, then record their audit IDs from
   the URL/history.
2. Export the local env and run the verifier (do not paste keys into the command or logs):

   ```bash
   set -a
   source .env
   set +a
   npx tsx scripts/seed-cognee.ts \
     --audit <live-audit-id-1> \
     --audit <live-audit-id-2> \
     --audit <live-audit-id-3>
   ```

3. Continue only if it prints `Cognee seed verified`. When Cognee returns deeper grounded
   context, the script also prints shared weaknesses, successful improvement channels, and
   its explanation. The script rejects REPLAY audits,
   unfinished audits, mixed trade/city inputs, and a missing/ambiguous recall. If it fails,
   leave Cognee disabled and demo without the memory line; never substitute fixture text.
4. Run one more LIVE audit for the same trade/city. Verify that both the exact
   `Compared to N similar businesses...` line and `memory: Cognee` chip appear. That final
   UI check is the acceptance evidence for F-091/F-092.

### Run 1 — LIVE, with keys, quiet network
- Conditions: `.env` has real `OPENAI_API_KEY` + `TAVILY_API_KEY` (and Cognee config if
  the seed gate above passed); presenter's own
  Wi-Fi/hotspot, not venue network.
- Verify:
  - [ ] Input → complete score in ≤60 s (plan §8 stop-ship line)
  - [ ] LIVE badge shown, truthful (not REPLAY)
  - [ ] Findability chip shows a real Tavily result, expandable
  - [ ] If Cognee was seeded, the real memory line and `memory: Cognee` chip both render
  - [ ] Every generated image shows the `AI concept` badge
  - [ ] Before/After preview renders and the divider drag works
  - [ ] No console errors visible if DevTools happens to be open
- Log: start time, score reveal time, Do-It-For-You completion time, any stall step.

### Run 2 — LIVE, venue Wi-Fi
- Conditions: same as Run 1 but physically on venue network (or the closest available
  proxy for it) — this is the real risk test, not a formality.
- Verify: same checklist as Run 1, **plus**:
  - [ ] Time each pipeline stage — venue Wi-Fi is usually the latency variable, not OpenAI
  - [ ] If `checking_local_search` (Tavily) errors: chip shows an honest error state, any
        derived judgment is labeled `ASSUMPTION` — never a silent fake result (plan §9)
  - [ ] If anything stalls past ~90s, note exactly which progress step and abort to REPLAY
        rather than waiting it out

### Run 3 — Wi-Fi OFF, REPLAY drill
- Conditions: turn Wi-Fi off (or airplane mode) on the demo machine entirely. Load the
  demo either via `DEMO_MODE=replay` (restart the server with that env var set) or the
  `?mode=replay` query param on an already-running instance, or the landing page's
  sample-report link (opens the REPLAY audit directly — confirm which of these exists once
  F-060/F-082 land; this doc lists all three routes so whichever ships still works).
- Verify:
  - [ ] `REPLAY SAMPLE` badge shown, truthful
  - [ ] Full walkthrough (score → channels → Improve It → Do It For You → Before/After)
        works with zero network calls
  - [ ] Pre-generated images and their `AI concept` badges render from
        `public/fixtures/rohrfuchs-berlin-replay/*`
  - [ ] Timing is comparable to Run 1/2 (REPLAY should not feel slower)
- **This is the schedule exit test at T5:00** (plan §7): "demo survives Wi-Fi loss." Do
  not consider F-102 done until this run passes clean.

### Abort-to-REPLAY drill (rehearse this explicitly, not just in theory)
One keystroke/click away at every point in the script:
1. Bookmark or memorize the REPLAY URL (`?mode=replay` on the current audit route, or the
   landing page's sample-report link) *before* going on stage.
2. If a live call visibly stalls or errors mid-script, say the honest line out loud —
   *"live network's not cooperating — here's the same walkthrough on a recorded run"* —
   and switch immediately. Do not debug on stage.
3. Rehearse this switch at least once per rehearsal run so it's muscle memory, not a
   panic decision.

### Timing log template
```
Run # | Date/time | Network condition | Input→Score (s) | Improve-all (s) | Stalls? | Pass/Fail
------|-----------|--------------------|--------|--------|---------|----------
1     |           | own hotspot        |        |        |         |
2     |           | venue Wi-Fi         |        |        |         |
3     |           | Wi-Fi OFF / REPLAY  |        |        |         |
```

---

## 3. Video shot list (F-103)

**Hard limit: ≤2:00.** Submission requirement is `FACT` (event brief): 2-minute video +
public GitHub repo, before 19:00. Maps directly onto §1's demo script — same beats, same
pitch lines, filmed once the rehearsals in §2 are clean.

| Shot | Duration | Screen capture | Voiceover (matches §1 pitch lines) |
|---|---|---|---|
| 1 | 0:00–0:12 | Landing page, full hero | Ten-second takeaway (verbatim, see §1 row 1) |
| 2 | 0:12–0:15 | Click CTA → input page loads | *"Let's show it a real, weak local site."* |
| 3 | 0:15–0:35 | Fill brand name + trade + paste target URL | *"Just the business name and their existing links."* |
| 4 | 0:35–0:50 | Analyzing checklist, steps flipping | *"Fetching what a customer sees, scoring text and photos with GPT-4o, checking real findability with Tavily."* |
| 5 | 0:50–1:05 | Score count-up, band, findability chip | Score + band + findability line (see §1 row 6) |
| 6 | 1:05–1:15 | Channel list, "N things stand between you and Hero" | *"Every row is backed by an actual quote or photo."* |
| 7 | 1:15–1:30 | Improve It on `hero_headline`, inline reveal | *"Real before, real after, in place."* |
| 8 | 1:30–1:40 | Do It For You click | *"You approve. We do the work."* |
| 9 | 1:40–1:55 | Before/After preview, divider drag, `AI concept` badge visible | Truth-badge + "publish this for me" lines (see §1 row 9) |
| 10 | 1:55–2:00 | Close, back to channel list, closing line | *"From Zero to Hero — for a real business, with receipts."* |

Recording notes:
- Record the **LIVE** run (Run 1 or 2 from §2), not REPLAY — the video should show a real
  audit of one of the scouted real sites (identities withheld from this repo), unless a
  live failure forces a REPLAY fallback recording as backup footage.
- Keep the cursor deliberate — no fumbling between fields; rehearse the exact click path
  from §1 before hitting record.
- Target viewport: desktop, matches the split-view Before/After demo default (plan §4.4).
- Submission requirement reminder (`FACT`, from the event brief): ≤2:00 video **and** a
  public GitHub repo, both before **19:00**.

---

## 4. Submission checklist (F-104)

Stop-ship items verbatim from plan §8, as checkboxes, plus repo/deadline mechanics.

### Product stop-ship (plan §8, verbatim)
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

### Repo & submission mechanics
- [ ] README present at `code/media-ad-coach/README.md` (F-101) — a judge can run the
      project from README alone.
- [ ] Secrets scan clean: no real API keys in any tracked file (`.env` is gitignored;
      only `.env.example` with empty values is tracked). Re-check with `git diff` / a
      `grep -r` for key-shaped strings before the final push.
- [ ] Event repo (this whole event folder, one git repo per workspace convention)
      pushed to `origin`.
- [ ] **Repo visibility set to Public** on GitHub before submitting the link — confirm in
      the GitHub UI, not just by pushing (a private repo with a green push is still not a
      valid submission).
- [ ] 2-minute video (§3) uploaded/linked per the event's submission form.
- [ ] Both video and repo link submitted **before 19:00**.
- [ ] Feature freeze held at T+255 (plan §7) — nothing shipped after that except
      reliability fixes; confirm no last-minute feature commits landed post-freeze.
- [ ] Submission receipt/confirmation captured (screenshot or confirmation email) as
      evidence the submission went through before the deadline.
