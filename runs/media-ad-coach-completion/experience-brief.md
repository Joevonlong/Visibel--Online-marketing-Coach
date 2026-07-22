# Experience Foundation Brief — Visibel R3

> Supporting evidence for `mvp.json@3`. The user selected the local Luminous Focus concept, explicitly authorized a complete frontend implementation, and renamed the product to Visibel on 2026-07-18.

## Control header

- Owner: `mission-control`
- Receivers: `mission-control`, `reviewer`
- Source events: decision sequences 16 and 24
- Output revision: 3
- Claim status: `FACT` for the selected references and existing application behavior; `ASSUMPTION` for visual-fit judgments
- Dependency rule: keep the existing dependency manifest; no new UI package is required

## Frozen direction

- Ten-second takeaway: See what customers see, fix what costs trust, and compare the result in one clear flow.
- Hero interaction: enter a business, run the audit, inspect prioritized evidence, improve selected channels, and compare the optimized preview.
- Target viewport: 1440 × 900 desktop, with a complete narrow-screen path.
- Screen story: input → progress → scored evidence → priorities → improvement → preview → business value.
- Required states: golden, pivot, loading, empty, error, degraded, and replay.

## Foundation decision

Selected foundation: `reference/frontend-concepts/01-luminous-focus.html`, interpreted through the supplied editorial reference image and the existing Next.js application shell.

The reference composition is reused for its oversized headline, concise supporting copy, generous whitespace, and direct calls to action. Its blue-purple glow language is rejected. The implementation keeps the existing form state, API calls, upload flow, polling, report actions, PDF download, history, sample audit, improvement controls, and before/after preview.

No third-party design system is introduced. Existing local primitives remain the stable integration surface.

## Design-system seed

- Color: near-black ink, warm white paper, stone surfaces, hairline gray borders, deep moss for positive status, restrained ochre for warnings.
- Exclusions: blue, purple, neon gradients, synthetic bloom/glow, glassmorphism, and decorative AI motifs.
- Type: large editorial display text; body copy at 16px or larger where it carries meaning; 12–13px reserved for compact status and metadata.
- Shape: controlled radii, thin borders, minimal shadow, clear full-width hit targets on narrow screens.
- Motion: short opacity/position feedback only; respect reduced motion.
- Accessibility: semantic labels, visible neutral focus rings, readable contrast, keyboard-operable actions.

## Screen and state blueprint

| Moment | Primary action | Visible payoff | Recovery |
|---|---|---|---|
| Landing | Start an audit or open the sample | Product value is clear before scrolling | Sample remains available without credentials |
| Input | Provide links or uploads and start | One focused form, explicit LIVE/REPLAY choice | Inline validation and honest missing-input guidance |
| Progress | Wait while named stages advance | The audit feels finite and inspectable | Failed state remains explicit; polling fallback stays intact |
| Report | Read score, evidence, and priorities | Problems are ordered by business impact | Empty/degraded evidence is labelled, not fabricated |
| Improve | Select channels and apply fixes | Improvement action is adjacent to the recommendation | Errors preserve the scored report and allow retry |
| Preview | Compare before and after | Judge-visible proof of the outcome | Captured or fixture imagery degrades to truthful placeholders |
| History | Reopen an audit | Persisted work is discoverable | Empty history has one clear next action |

## Frozen handoff

- Experience contract: `mvp.json@2`
- UI/API contract: `ui-api-contract.json@1` (unchanged)
- Fixture: `fixture.json@1` (unchanged)
- Design tokens: `code/media-ad-coach/app/globals.css`
- Owned implementation paths: `code/media-ad-coach/app/**`, `code/media-ad-coach/components/**`
- Acceptance: typecheck, full tests, production build, desktop and narrow visual checks, and an end-to-end replay interaction check.
- Stop condition: return to SPEC if implementation requires changing schemas, API semantics, persistence, providers, fixture semantics, or dependencies.

## Freeze checklist

- [x] Human selected the visual foundation and direction
- [x] Ten-second takeaway, hero interaction, viewport, and screen story are pinned
- [x] Existing components and behavior are the reuse foundation
- [x] Design tokens have one serialized owner
- [x] UI/API, fixture, modes, and provider responsibilities remain unchanged
- [x] Material frontend work is bounded as `FRONTEND-UX-R2`
