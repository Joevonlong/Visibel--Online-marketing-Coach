# Task Packet — __TASK_ID__: __TITLE__

> Supporting execution packet only. The event log is authoritative for task lifecycle and ownership changes; corresponding lifecycle fields in `run.json` are projections. `run.json` remains authoritative for the current approved Run contract, and `snapshot.json` is the non-authoritative rebuildable projection.

## Identity

- Run: `media-ad-coach-completion`
- Phase: `__PHASE__`
- Owner role: `__OWNER_ROLE__`
- Owner actor: `__OWNER_ACTOR__`
- Priority: `__PRIORITY__`
- Token/time budget: `__BUDGET__`
- Execution mode: `LIVE` / `LOCAL_DETERMINISTIC` / `REPLAY` / `HANDOFF_REQUIRED`
- Claim status of inputs: `FACT` / `ASSUMPTION` / `UNKNOWN`

## Contract revisions

- `run.json`: `__REVISION_OR_EVENT__`
- `mvp.json`: `__REVISION__`
- `fixture.json`: `__REVISION__`
- `demo.md`: `__REVISION__`
- UI/API contract: `__PATH__` at revision `__REVISION__`
- Upstream handoff: `__PATH_OR_NONE__`

## Objective and visible payoff

`__ONE_BOUNDED_OUTCOME__`

Judge-visible proof: `__WHAT_A_JUDGE_CAN_SEE_OR_VERIFY__`

## Owned paths

These paths must not overlap another active writable task.

- `__PATH__`

Read-only inputs:

- `__PATH__`

Forbidden paths / non-goals:

- `__PATH_OR_SCOPE__`

## Inputs and interfaces

- Frozen input/fixture: `__INPUT__`
- Interface consumed: `__INTERFACE__`
- Interface produced: `__INTERFACE__`
- External/provider/hosted-environment requirements: `__REQUIREMENTS_OR_NONE_WITH_RATIONALE__`
- Secrets are named only, never copied into this packet: `__ENV_VAR_NAMES_OR_NONE__`

## Deliverables

- `__OUTPUT_PATH_AND_PURPOSE__`
- Evidence: `__SCREENSHOT_TRACE_TEST_OR_HEALTHCHECK__`
- Handoff: `__HANDOFF_PATH__`

## Acceptance

Run exactly from `__WORKING_DIRECTORY__`:

```text
__ACCEPTANCE_COMMAND__
```

Expected observable result: `__EXPECTED_RESULT__`

Additional checks:

- [ ] Happy path and the assigned failure/replay path are proven
- [ ] Mode and provenance are visible and truthful
- [ ] No unapproved dependency, provider mutation, or scope expansion occurred
- [ ] Provider- and hosted-only work is either proven when applicable or marked `N/A` with the frozen rationale
- [ ] Outputs stay inside owned paths
- [ ] Acceptance evidence identifies commit/build and authoritative revisions

## Stop and return conditions

Stop and hand back to Mission Control when:

- a frozen interface, experience contract, provider choice, or fixture must change;
- a writable path conflicts with another task;
- external provisioning, credential use, or irreversible action needs approval;
- only `HANDOFF_REQUIRED` can truthfully describe the result.
