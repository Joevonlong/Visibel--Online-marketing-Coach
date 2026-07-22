// F-065..F-068 shared plumbing: the exact shape GET /api/audits/:id returns
// (see app/api/audits/[id]/route.ts and docs/CONTRACTS.md "API endpoints").
// Type-only relative imports from "../schemas" per AGENTS.md (lib/** has no
// "@/" resolution under vitest) — this file has zero runtime imports.
import type { AuditStatus, Channel, Report } from "../schemas";

/**
 * A progress_events row as the poll endpoint serializes it. Deliberately
 * NOT `ProgressEvent` from lib/schemas: the orchestrator can emit a step
 * named "failed" that is not in the `AnalyzeProgressStep`/`ImproveProgressStep`
 * enum (see AGENTS.md "Progress steps" convention) — `audit.status` is the
 * authoritative failure signal, and UI code must ignore unrecognized step
 * names defensively rather than fail to type-check against them.
 */
export type ProgressEventLike = {
  step: string;
  at: string;
  detail: string | null;
};

/** GET /api/audits/:id response shape — the 1s/5s polling contract. */
export type AuditPollResponse = {
  status: AuditStatus;
  /**
   * FEA-112 / ISS-032: how many image channels are still generating. Optional
   * because a client may be seeded from an older payload, but authoritative
   * when present: `status: "complete"` NO LONGER means the images have landed,
   * so this is the signal that decides whether the page keeps updating itself.
   */
  images_pending?: number;
  execution_mode: "LIVE" | "REPLAY";
  progress: ProgressEventLike[];
  report: Report | null;
  channels: Channel[] | null;
  preview_ready: boolean;
  overall_score: number | null;
};

/** Server -> client asset shape handed to ReportView (already URL-resolved
 *  via lib/client/assets.ts#assetUrl on the server).
 *
 *  `ref`: a stable secondary lookup key derived from the storage_path
 *  filename stem (lib/client/assets.ts#deriveAssetRef). REPLAY fixture
 *  assets are re-inserted with fresh db `id`s, but the fixture's report
 *  (criteria_by_asset keys / finding.asset_ref / channel before_json refs)
 *  keeps pointing at the fixture's original ids — `ref` lets lookup code
 *  fall back to a match (id first, then ref) instead of silently finding
 *  nothing. null when no filename could be derived. */
export type AssetView = {
  id: string;
  kind: string;
  label: string | null;
  url: string | null;
  ref: string | null;
};
