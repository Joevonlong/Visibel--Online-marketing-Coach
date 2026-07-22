# Independent Review Report — media-ad-coach-completion / __REVIEW_ID__

> Supporting, read-only evidence. Mission Control alone records gate decisions, phase changes, and authoritative state; the Reviewer never edits product paths or records a gate.

## Review identity

- Owner: `reviewer`
- Gate type: `REVIEW` / `DEMO` — choose exactly one
- Owned paths: none
- Reviewed task/slice or integrated build: `__REVIEW_TARGET__`
- Reviewed owner(s): `__OWNER_ROLES__`
- Read-only paths: `__PATHS__`
- Acceptance commands executed: `__COMMANDS__`
- Commit/build: `__COMMIT__` / `__BUILD_REVISION__`
- `run.json` revision/event: `__REVISION_OR_EVENT__`
- MVP / fixture / demo / UI-API revisions: `__REVISIONS__`
- Observed execution mode: `LIVE` / `LOCAL_DETERMINISTIC` / `REPLAY` / `HANDOFF_REQUIRED`
- External capability applicable: `true` / `false`
- External capability rationale: `__RATIONALE__`
- Hosted release applicable: `true` / `false`
- Hosted release rationale: `__RATIONALE__`

## Gate boundary

Choose one boundary and mark the other checklist `N/A — wrong gate type`.

- `REVIEW`: independently inspect the implemented slice after `SELF_TEST`; check code, frozen contracts, fixture behavior, ownership, and reproducible acceptance. Recommend advance to `RELIABILITY`, return to `IMPLEMENT`, or return to `SPEC`.
- `DEMO`: independently inspect the final integrated build after `INTEGRATE`; check judge-visible experience, reliability evidence, timed rehearsal, recovery, truthful modes, and submission readiness. Recommend advance to `SUBMIT` or return to the earliest affected phase.

## Verdict

`PASS` / `PASS_WITH_NONBLOCKING_FINDINGS` / `FAIL`

Gate recommendation: `__VALID_RECOMMENDATION_FOR_SELECTED_GATE__`

Rationale: `__ONE_PARAGRAPH__`

## Evidence classification audit

| Claim | Classification | Source/evidence | Correct? | Required correction |
|---|---|---|---|---|
| `__CLAIM__` | `FACT` / `ASSUMPTION` / `UNKNOWN` | `__SOURCE__` | yes/no | `__ACTION__` |

| Result | Presented mode | Observed mode | Provenance | Truthful? |
|---|---|---|---|---|
| `__RESULT__` | `__MODE__` | `__MODE__` | `__PATH_OR_ID__` | yes/no |

## Findings

Order by severity. Every blocking finding must name a reproducible failure, affected path, return owner, and acceptance condition.

| Severity | Finding | Evidence/reproduction | Return owner | Acceptance condition |
|---|---|---|---|---|
| P0/P1/P2/P3 | `__FINDING__` | `__EVIDENCE__` | `__ROLE__` | `__CONDITION__` |

## Canonical case coverage — both gates

| Fixture case | Evidence | Contract/UI state agrees? | Blocking defect? |
|---|---|---|---|
| golden | `__EVIDENCE__` | yes/no | yes/no |
| pivot | `__EVIDENCE__` | yes/no | yes/no |
| loading | `__EVIDENCE__` | yes/no | yes/no |
| empty | `__EVIDENCE__` | yes/no | yes/no |
| error | `__EVIDENCE__` | yes/no | yes/no |
| degraded | `__EVIDENCE__` | yes/no | yes/no |
| replay | `__EVIDENCE__` | yes/no | yes/no |

## REVIEW gate — code and contract

Complete only when gate type is `REVIEW`.

- [ ] Frozen primary path works from a clean start
- [ ] Implementation matches the frozen experience, UI/API, fixture, execution-mode, and provider-responsibility contracts
- [ ] Frontend and backend consume the same contract revision
- [ ] Acceptance commands reproduce the stated observable result
- [ ] No hidden writable-path overlap, unapproved dependency, or scope change exists
- [ ] Errors and fallbacks preserve mode, request ID, provenance, and truthful claims
- [ ] Findings distinguish implementation defects from material contract changes that require return to `SPEC`

REVIEW gate result: `PASS_TO_RELIABILITY` / `RETURN_TO_IMPLEMENT` / `RETURN_TO_SPEC` / `N/A — DEMO_GATE`

## DEMO gate — final experience and reliability

Complete only when gate type is `DEMO`.

### Judge-visible experience

Score 1–5 and attach independent evidence.

| Dimension | Score | Evidence | Blocking defect? |
|---|---:|---|---|
| Hierarchy | 0 | `__PATH__` | yes/no |
| Consistency | 0 | `__PATH__` | yes/no |
| Distinctiveness | 0 | `__PATH__` | yes/no |
| Product maturity | 0 | `__PATH__` | yes/no |
| Demo readability | 0 | `__PATH__` | yes/no |

- [ ] Ten-second takeaway and hero interaction match the frozen experience contract
- [ ] Target viewport has no overflow or clipped critical content
- [ ] Keyboard, focus, labels, contrast, and reduced-motion behavior meet the floor
- [ ] Mode, request ID, provenance, errors, and fallback are judge-visible
- [ ] Timed rehearsal reaches the core payoff and close within the budget
- [ ] Recovery rehearsal reaches a truthful fallback within the recovery budget
- [ ] Screen, spoken claim, demo evidence, and submission copy agree

### Reliability and submission readiness

- [ ] Focused verification passes on the reviewed commit/build
- [ ] Demo can start from a documented clean state
- [ ] Golden, pivot, failure, degraded, and replay branches are rehearsed
- [ ] Submission URL/ID/time, human confirmation, commit/build, artifact revisions, and claim status can be recorded in `run.json.submission_receipt`

DEMO gate result: `PASS_TO_SUBMIT` / `RETURN_TO_DEMO` / `RETURN_TO_INTEGRATE` / `RETURN_TO_RELIABILITY` / `RETURN_TO_IMPLEMENT` / `RETURN_TO_SPEC` / `N/A — REVIEW_GATE`

## External capability, security, and release

If external capability and hosted release are both not applicable, record `N/A — __RATIONALE__` for provider/hosted checks, confirm the same rationale appears in the MVP, plan, and demo, and verify that no `LIVE` or hosted claim is made. This is a valid passing branch.

If either branch is applicable:

- [ ] Applicable live capability has health and primary-operation smoke evidence
- [ ] Secret names are documented but values are absent from repository, client bundle, evidence, output, and logs
- [ ] External writes, provisioning, credential wiring, domains, OAuth/IAM, and public deployment have explicit human approval
- [ ] Applicable hosted URL serves the reviewed build revision
- [ ] Applicable hosted or local fallback works within the demo recovery budget
- [ ] Required but unperformed external work is marked `HANDOFF_REQUIRED`

Applicability verdict: `PASS` / `FAIL` / `N/A — __RATIONALE__`

## Return packet

- Blocking owner(s): `__ROLE__`
- Earliest affected phase: `__PHASE__`
- Exact paths allowed to change: `__PATHS__`
- Acceptance commands: `__COMMANDS__`
- Evidence to preserve: `__PATHS__`
- Next reviewer checkpoint: `__CONDITION__`
