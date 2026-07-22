// Shared plumbing type for the preview overlay (F-074..F-076): maps an
// asset id (as referenced by PreviewJson's *_ref fields) to a browser-
// fetchable URL + truth badge. Built once in app/audit/[id]/preview/page.tsx
// from lib/db.listAssets() + lib/client/assets.assetUrl(), then threaded
// through PreviewOverlay -> SplitView -> {Before,After}Panel.
import type { AfterOriginalGroup } from "../../lib/client/curationMeta";

export type AssetLookup = Record<
  string,
  {
    url: string | null;
    label: "ai_concept" | "enhanced" | null;
    /**
     * FEA-110 / ISS-017 / ISS-018: the backend After-page curation decision
     * (meta_json.after_curation). Optional — absent in the current replay
     * fixture, so the UI degrades gracefully when undefined.
     */
    reason?: string | null;
    group?: AfterOriginalGroup | null;
    /**
     * ISS-032 / FEA-112: true when this row is a streamed PARTIAL whose final
     * frame never landed (`meta_json.partial_only`). Still a real render of
     * this business's image — just softer — so it is labelled, not hidden.
     */
    partialOnly?: boolean;
  }
>;
