# runs/

HDOS run state for this event — one subfolder per run, holding the four authoritative artifacts (`run.json`, `mvp.json`, `fixture.json`, `demo.md`), the append-only event log, and evidence.

Runs are created and selected from the **workspace root** (the parent `AI_Hackthon_workspace`), not from inside this repository:

```bash
pnpm hdos:init -- --run projects/AI-Hackthon-2026-07-18/runs/<run-id>
```

After that, `pnpm hdos:status` and `pnpm hdos:resume` follow the workspace's active-run pointer. In a fresh machine, Cloud, or web session, select the run explicitly with the same `--run` path (or `HDOS_RUN_DIR`); never assume the local pointer transferred.
