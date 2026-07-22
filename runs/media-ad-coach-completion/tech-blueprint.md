# Tech Blueprint — media-ad-coach-completion / __BLUEPRINT_ID__

> Supporting evidence only. This blueprint informs `mvp.json`, `fixture.json`, and the task plan; it never becomes a fifth source of execution state. Mission Control alone freezes `TECH_BLUEPRINT_FROZEN` inside `SPEC`, together with `EXPERIENCE_CONTRACT_FROZEN`, before `PLAN` and parallel implementation.

## Control header

- Owner: `system-architect`
- Receivers: `mission-control`, `frontend-builder`, `backend-integrator`, `cloud-release`, `reviewer`
- Owned paths: `__BLUEPRINT_PATH__`
- Source `run.json` revision/event: `__RUN_REVISION_OR_EVENT__`
- Source concept brief: `__CONCEPT_BRIEF_PATH_OR_NONE__`
- Output path/revision: `__PATH__` / `__REVISION__`
- Claim vocabulary: `FACT`, `ASSUMPTION`, `UNKNOWN`
- Execution vocabulary: `LIVE`, `LOCAL_DETERMINISTIC`, `REPLAY`, `HANDOFF_REQUIRED`
- Boundary: specify and recommend only; no scaffolding, dependency installation, manifest, lockfile, token, or run-state change.

## 1. Capability inventory

Every capability must serve the hero flow, a judging criterion, or recovery. Record what was deliberately excluded.

| Capability | Needed for | Owner role | Claim status | Notes |
|---|---|---|---|---|
| `__CAPABILITY__` | hero / judging / recovery | `__ROLE__` | `FACT` / `ASSUMPTION` / `UNKNOWN` | `__NOTES__` |

Deliberately excluded: `__EXCLUSIONS_AND_WHY__`

## 2. Stack recipe

One runnable choice per layer; no layer left "to decide during implementation". Verify version, license, and maintenance against primary sources with access date.

| Layer | Choice | Version | License | Primary source / access date | Mature OSS reference | Rejected alternative and why |
|---|---|---|---|---|---|---|
| Frontend framework + tooling | `__CHOICE__` | `__VERSION__` | `__LICENSE__` | `__SOURCE_AND_DATE__` | `__REFERENCE_PROJECT__` | `__REJECTION__` |
| Backend runtime + framework | `__CHOICE__` | `__VERSION__` | `__LICENSE__` | `__SOURCE_AND_DATE__` | `__REFERENCE_PROJECT__` | `__REJECTION__` |
| Persistence engine + access layer | `__CHOICE_OR_NOT_APPLICABLE__` | `__VERSION__` | `__LICENSE__` | `__SOURCE_AND_DATE__` | `__REFERENCE_PROJECT__` | `__REJECTION__` |
| Run / deployment target | `__CHOICE__` | `__VERSION__` | `__LICENSE__` | `__SOURCE_AND_DATE__` | `__REFERENCE_PROJECT__` | `__REJECTION__` |

- Scaffold command for the implementation task owner: `__SCAFFOLD_COMMAND_OR_NONE__`
- Compatibility with the experience foundation: `__ALIGNMENT_WITH_EXPERIENCE_BRIEF__`

## 3. Data and persistence contract

- Persistence applicable: `true` / `false`
- Rationale: `__WHY_PERSISTENT_STORAGE_IS_OR_IS_NOT_REQUIRED__`

When not applicable, mark the rest of this section `N/A`; a truthful no-database design is complete. When applicable:

| Entity | Key | Fields (smallest set) | Relationships | Retention / privacy |
|---|---|---|---|---|
| `__ENTITY__` | `__KEY__` | `__FIELDS__` | `__RELATIONS__` | `__POLICY__` |

- Storage engine and location: `__ENGINE_AND_PATH_OR_URL_NAME__`
- Migration / bootstrap step: `__COMMAND__`
- Deterministic seed strategy: derive seed data from `fixture.json` cases so `__SEED_COMMAND__` rebuilds the demo database on any machine
- Reset behavior for rehearsals: `__RESET_COMMAND__`
- Implementation owner: `backend-integrator` inside owned paths

## 4. Service topology and external capability map

- Runtime topology: `__PROCESSES_AND_MODULE_BOUNDARIES__`
- UI/API boundary: `ui-api-contract.json` at revision `__REVISION__`; breaking changes return to Mission Control for a revision bump
- Fixture alignment: `fixture.json` at revision `__REVISION__`

| Capability | Provider / partner tech | Required by rules? | Adapter boundary | Env var names (names only) | Modes | Fallback order | Owner | Claim status |
|---|---|---|---|---|---|---|---|---|
| `__CAPABILITY__` | `__PROVIDER__` | yes/no | `__ADAPTER_PATH_OR_MODULE__` | `__ENV_VAR_NAMES__` | `__MODES__` | `__FALLBACK_ORDER__` | `__ROLE__` | `FACT` / `ASSUMPTION` / `UNKNOWN` |

- How each required partner technology is load-bearing, not decorative: `__PARTNER_TECH_JUSTIFICATION__`
- Secrets policy: environment-variable names only; values never enter the repository, fixtures, logs, or evidence.

## 5. Repository layout and parallel build order

Proposed layout with non-overlapping owned paths:

| Path | Purpose | Owner role | Serialized surface? |
|---|---|---|---|
| `__PATH__` | `__PURPOSE__` | `__ROLE__` | yes/no |

Build order as a small dependency graph; tasks on the same row may run in parallel:

| Order | Task | Owner | Depends on | Acceptance command |
|---|---|---|---|---|
| 1 | `__TASK__` | `__ROLE__` | design lock | `__COMMAND__` |
| 2 | `__TASK__` | `__ROLE__` | `__DEPENDENCY__` | `__COMMAND__` |

## 6. Risk register

| Risk | Impact on demo | Kill condition (time-boxed) | Fallback that keeps the demo alive |
|---|---|---|---|
| `__RISK__` | `__IMPACT__` | `__KILL_CONDITION__` | `__FALLBACK__` |

## Freeze checklist — Mission Control with the human

- [ ] Stack recipe has one runnable choice per layer with evidence and rejections
- [ ] Persistence decision is explicit; when applicable the seed derives from fixture cases
- [ ] Every external or partner capability has an adapter boundary, env-var names, modes, fallback, and owner
- [ ] Required partner technology is load-bearing in the hero flow
- [ ] Repository layout gives Frontend Builder and Backend Integrator non-overlapping owned paths
- [ ] Parallel build order and acceptance commands let Mission Control dispatch task packets directly
- [ ] Open `UNKNOWN` items have owners and validation steps or are accepted as time-boxed assumptions
- [ ] Human approves; Mission Control records `TECH_BLUEPRINT_FROZEN` with this blueprint's revision

Frozen contract ID/revision/event after Mission Control approval: `__BLUEPRINT_ID__` / `__REVISION__` / `__EVENT_ID__`
