# Local verification evidence — 2026-07-18

Status: `FACT` for the checks below. Execution modes: `LOCAL_DETERMINISTIC` and labelled `REPLAY` only.

## Checkpoint

- Event repository: `projects/AI-Hackthon-2026-07-18`
- Branch: `feat/finish-all-remaining`
- Synchronized base: `615e692381e82542dd8830a78e97bf9428894cde`
- `origin/main`: `615e692381e82542dd8830a78e97bf9428894cde`
- Ahead/behind at verification: `0/0`
- Build revision: synchronized base plus the preserved shared working tree. This is not a clean Git checkpoint and is not claimed as a merged release.

## Product gate

Run from `code/media-ad-coach` with Node.js `v22.23.1` and pnpm `11.7.0`:

| Check | Observed result |
|---|---|
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm test` | PASS — 16 test files, 246 tests |
| `pnpm build` | PASS — Next.js 15.5.20 production build; screenshot, SSE, audit, preview and PDF routes compiled |
| `git diff --check` | PASS |
| `pnpm exec playwright --version` | PASS — Playwright 1.61.1 |
| Local Chromium launch + `page.screenshot` smoke | PASS — browser launched and produced a 14,001-byte PNG |

## Repeatability evidence

The focused test `tests/fixture.test.ts` case `runs analyze → improve all → preview with no live credentials` was executed three times sequentially with `OPENAI_API_KEY`, `TAVILY_API_KEY`, `COGNEE_API_KEY`, and `COGNEE_API_URL` removed from the environment.

| Run | Result | Duration |
|---|---|---|
| 1 | PASS | 1.75 s |
| 2 | PASS | 1.01 s |
| 3 | PASS | 1.01 s |

These runs prove deterministic provider-free replay. They do not prove a physical Wi-Fi-off rehearsal or a LIVE provider call.

## Credential and external-state boundary

- `.env` was absent.
- `OPENAI_API_KEY`, `TAVILY_API_KEY`, `COGNEE_API_KEY`, and `COGNEE_API_URL` were unset.
- Cognee seed/recall, a real LIVE fixture recording, gpt-image-1 provider acceptance, and real target-site browser capture remain `HANDOFF_REQUIRED` until credentials and an operator-approved live audit are available.
- A physical Wi-Fi-off rehearsal, two-minute video, public push/deployment, and organizer submission remain human/external actions. No public resource was created and no submission was claimed.

## Scope boundary

Lane A frontend files listed in `code/media-ad-coach/docs/TEAM-SPLIT.md` remain owned by the second teammate. This completion pass did not intentionally edit those paths. The full build included the teammate's currently present working-tree changes, which were preserved during origin synchronization.
