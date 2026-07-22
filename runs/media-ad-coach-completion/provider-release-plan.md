# Provider and Release Plan — media-ad-coach-completion / provider-release-v1

> Supporting evidence only. `mvp.json` owns the provider/release contract. This document records the executable boundary and never promotes a replay or mocked response to `LIVE`.

## Control header

- Decision recorder: `mission-control`
- Execution owner: `backend-integrator` for provider adapters; `cloud-release` only after explicit human approval
- Receiver: `mission-control`
- Owned paths: `code/media-ad-coach/lib/providers/**`, `lib/agents/**`, `lib/memory/**`, `lib/pipeline/**`, `lib/improve/**`, `app/api/audits/**`
- Acceptance commands: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, workspace `pnpm secret:scan`
- Source MVP revision: `1`
- UI/API contract revision: `1`
- Output path/revision: `runs/media-ad-coach-completion/provider-release-plan.md` / `1`
- Claim vocabulary: `FACT`, `ASSUMPTION`, `UNKNOWN`
- Execution vocabulary: `LIVE`, `LOCAL_DETERMINISTIC`, `REPLAY`, `HANDOFF_REQUIRED`

## Applicability decision

- External capability applicable: `true`
- Rationale: the frozen concept requires OpenAI Responses/Vision/Images, Tavily Search, and Cognee Memory for the full `LIVE` proof.
- Hosted release applicable: `false` for the currently authorized slice.
- Rationale: the approved release target is the operator laptop at `http://localhost:3000`; no public deployment, provider resource creation, domain, OAuth, or IAM action has been authorized.
- `mvp.provider_release_contract.applicable`: `true`
- Combined rationale: the external provider branch is required, while public hosting remains a separately authorized handoff. Missing credentials must visibly degrade to replay or a truthful error.

## Capability-to-provider matrix

| Capability | Provider/API | Expected mode | Fallback | Rationale | Claim status |
|---|---|---|---|---|---|
| Structured audit and vision extraction | OpenAI Responses/Vision | `LIVE` | labelled `REPLAY` fixture | Required judge-visible analysis capability | `FACT` in code; live operation `UNKNOWN` until smoke |
| “Do it for you” image relight/recrop | OpenAI Images `gpt-image-1` | `LIVE` | preserve original and disclose skipped enhancement | F-096 requires a real image edit, never a fabricated generated asset | `FACT` in code; live operation `UNKNOWN` until smoke |
| Citation and image discovery | Tavily Search | `LIVE` | labelled `REPLAY` evidence | Required partner search capability | `FACT` in code; live operation `UNKNOWN` until smoke |
| Cross-audit memory | Cognee REST `/api/v1/add` and `/api/v1/search` | `LIVE` when configured | omit memory line | F-091/F-092 require genuine recalled context | `FACT` in adapter; live persistence `UNKNOWN` until smoke |
| Judge-facing application | Local Next.js process | `LOCAL_DETERMINISTIC` for build/tests; `LIVE` or `REPLAY` per audit | local replay fixture | Smallest currently authorized runnable target | `FACT` |

- Selection rationale: these providers are fixed by the approved concept and feature plan; no substitute provider is introduced.
- Rejected options: browser-side provider calls (secret exposure), silently generated fixture output (truth violation), unapproved public deployment (authorization violation).

## Environment and secret boundary

| Variable | Required in | Owner | Client-visible? | Validation | Missing behavior |
|---|---|---|---|---|---|
| `OPENAI_API_KEY` | local `LIVE` | event operator | no | `pnpm check-env` plus primary audit smoke | `LIVE` provider stages fail/degrade truthfully; `REPLAY` remains available |
| `TAVILY_API_KEY` | local `LIVE` | event operator | no | `pnpm check-env` plus audit citations | search stage degrades; no fake citations |
| `COGNEE_API_URL` | memory-enabled `LIVE` | event operator | no | add/search smoke | Cognee integration disables non-blockingly |
| `COGNEE_API_KEY` | Cognee Cloud, when required | event operator | no | authenticated add/search smoke | memory is omitted; no recall claim |
| `OPENAI_MODEL_TEXT` / `OPENAI_MODEL_VISION` / `OPENAI_MODEL_IMAGE` | optional local override | event operator | no | runtime model report/test | frozen defaults are used |

- Auth flow: server-to-server API keys read from process environment; no browser or repository secret storage.
- Least privilege: provider-scoped API keys limited to the required project/workspace where supported.
- Data sent externally: submitted business URL, form text, harvested public page/image material, and the minimal structured prompt/context required for the audit or edit.
- Retention/logging: provider-side retention is `UNKNOWN` until the event operator confirms the selected account policy; the app stores only its local SQLite audit/evidence/assets.
- External mutation requiring human approval: public deployment, public repository publication, organizer submission, provider provisioning, domain, OAuth, or IAM changes.

## Runtime modes and recovery

| Mode | Provider contacted? | Data source | Visible claim | Entry condition |
|---|---|---|---|---|
| `LIVE` | yes | observed provider response | only observed output | credentials plus provider/operation smoke pass |
| `LOCAL_DETERMINISTIC` | no | test fixtures and isolated temp DB/storage | synthetic test result | typecheck/test/build |
| `REPLAY` | no | frozen `replay-audit.json` provenance | visibly replayed output | `mode=replay` or `DEMO_MODE=replay` |
| `HANDOFF_REQUIRED` | no/partial | required external or human dependency | no completion claim | missing authorization/credential/evidence |

| Failure | Detection | User-visible behavior | Retry | Fallback |
|---|---|---|---|---|
| Provider unavailable / invalid credential | non-2xx, structured provider error | failed or degraded stage | bounded by adapter timeout/retry policy | explicitly start a replay audit |
| Timeout or rate limit | timeout/429 | failed or degraded stage | bounded only | replay; never relabel as live |
| Cognee unavailable | disabled/timeout/non-2xx | memory line omitted | bounded/non-blocking | continue the audit without memory |
| Deterministic fixture invalid | schema/provenance test | hard error | no | stop and repair fixture |
| Local target unavailable | health/start failure | app unavailable | restart once after build | run verified build or replay on recovered local process |

## Release target

- Hosting provider/environment: event operator laptop, local Next.js
- URL: `http://localhost:3000`
- Frozen commit/build: `HANDOFF_REQUIRED` until the integration checkpoint is recorded
- Build command: `pnpm build`
- Start command: `pnpm start`
- Health endpoint: `GET /api/health`
- Primary smoke: `POST /api/audits` followed by `GET /api/audits/:id` or its event stream until a terminal state
- Fallback: restart with `DEMO_MODE=replay` or submit `mode=replay`
- Rollback: return to the last verified local checkpoint if the integrated build or primary smoke fails
- Public host: `N/A — not authorized`; deployment URL and rollback target therefore remain `HANDOFF_REQUIRED` rather than guessed.

## Acceptance state

- [ ] Environment validation fails safely when a required value is missing
- [ ] Typecheck, focused tests, production build, and secret scan pass against one checkpoint
- [ ] One golden replay primary-operation smoke passes
- [ ] Error, degraded, replay, and terminal stream paths match the frozen fixture and UI/API contract
- [ ] Browser bundles, evidence, and logs contain no secrets
- [ ] Live OpenAI, Tavily, and Cognee operation smoke passes with operator-supplied credentials
- [ ] Three rehearsals and fallback timing are recorded against the fixed checkpoint
- [ ] Explicit human approval is recorded before any public deployment or organizer submission

Unchecked items are pending evidence, not failed claims. Until credentialed smoke exists, provider implementation is `FACT`, provider availability is `UNKNOWN`, and F-092 remains `HANDOFF_REQUIRED`.
