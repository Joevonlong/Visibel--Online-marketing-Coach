# Concept Brief — media-ad-coach-completion / __BRIEF_ID__

> Supporting evidence only. This brief informs `run.json` and `mvp.json`; it never freezes scope, selects a winner, or becomes a fifth source of execution state.

## Control header

- Owner: `product-strategist`
- Receiver: `mission-control`
- Owned paths: `__OWNED_PATHS__`
- Acceptance commands/checks: `__ACCEPTANCE__`
- Source `run.json` revision/event: `__RUN_REVISION_OR_EVENT__`
- Output path/revision: `__PATH__` / `__REVISION__`
- Claim vocabulary: `FACT`, `ASSUMPTION`, `UNKNOWN`
- Execution vocabulary: `LIVE`, `LOCAL_DETERMINISTIC`, `REPLAY`, `HANDOFF_REQUIRED`

## Official challenge frame

### FACT

- `__VERIFIED_RULE_OR_CRITERION_WITH_SOURCE__`

### ASSUMPTION

- `__BOUNDED_ASSUMPTION_AND_VALIDATION_PLAN__`

### UNKNOWN

- `__UNRESOLVED_QUESTION_OWNER_AND_DEADLINE__`

## Ten-second opportunity

- Target user: `__USER__`
- Painful moment: `__MOMENT__`
- Visible transformation: `__BEFORE_TO_AFTER__`
- Why an agent is necessary: `__AGENTIC_REASON__`
- Judge-visible proof: `__EVIDENCE__`

## Candidate concepts

Produce 1–3 concepts, usually 3, and use 1–5 scores. If only 1 or 2 concepts are viable, record the concrete reason instead of padding the list with weak options. A candidate is not approved scope until the human decision is recorded in `run.json`.

- Candidate count: `__ONE_TO_THREE__`
- If fewer than three, why: `__REQUIRED_REASON_OR_NOT_APPLICABLE__`

| Concept | Theme fit | Ten-second clarity | Demo wow | Feasible in time | External dependency risk | Fallback strength | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| A — `__NAME__` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — `__NAME__` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C — `__NAME__` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Candidate A

- Hero interaction: `__INTERACTION__`
- Narrow tracer bullet: `__SLICE__`
- Likely UI foundation: `__FOUNDATION_NEED__`
- External/provider/data dependency or none: `__DEPENDENCY_OR_NONE__`
- Credible fallback: `__FALLBACK__`
- Biggest unknown: `__UNKNOWN__`

### Candidate B

> Omit this section when the documented candidate count is 1.

- Hero interaction: `__INTERACTION__`
- Narrow tracer bullet: `__SLICE__`
- Likely UI foundation: `__FOUNDATION_NEED__`
- External/provider/data dependency or none: `__DEPENDENCY_OR_NONE__`
- Credible fallback: `__FALLBACK__`
- Biggest unknown: `__UNKNOWN__`

### Candidate C

> Omit this section when the documented candidate count is 1 or 2.

- Hero interaction: `__INTERACTION__`
- Narrow tracer bullet: `__SLICE__`
- Likely UI foundation: `__FOUNDATION_NEED__`
- External/provider/data dependency or none: `__DEPENDENCY_OR_NONE__`
- Credible fallback: `__FALLBACK__`
- Biggest unknown: `__UNKNOWN__`

## Recommendation

- Recommended concept: `__CANDIDATE__`
- Why it can win: `__RATIONALE__`
- What must be cut: `__CUTS__`
- Kill condition: `__TIMEBOXED_KILL_CONDITION__`
- Required human decision: `approve`, `revise`, or `reject`

## Proposed specialist activation

| Specialist | Activate? | Reason | First bounded output | Execution mode |
|---|---|---|---|---|
| Experience Scout | yes/no | `__WHY__` | `experience-brief.md` | `__MODE__` |
| Frontend Builder | yes/no | `__WHY__` | `__SLICE__` | `__MODE__` |
| Backend Integrator | yes/no | `__WHY__` | `__CONTRACT_OR_SLICE__` | `__MODE__` |
| Cloud Release | yes/no | `__WHY_REQUIRED_OR_WHY_NOT_APPLICABLE__` | `provider-release-plan.md` or explicit no-cloud decision | `__MODE__` |

## Handoff gate

- [ ] Facts have sources; assumptions have validation plans; unknowns have owners
- [ ] There are 1–3 concepts (normally 3); any count below 3 has a concrete reason
- [ ] Exactly one recommended concept and a documented drop order exist
- [ ] Hero proof can be demonstrated within the event and demo limits
- [ ] Every required live dependency has a local deterministic or replay fallback, or the concept explicitly records that no external dependency is required
- [ ] Mission Control records the human decision in `run.json` before downstream work starts
