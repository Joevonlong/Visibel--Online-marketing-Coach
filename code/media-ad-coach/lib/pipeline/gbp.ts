// F-024/F-025 — Google Maps input handling + GBP screenshot extraction +
// precedence merge (plan §3.3, feature-breakdown F-024/F-025, "identical
// method and precedence rules as v1 §5.2").
//
// P0 had NO official Places API dependency, so a Maps URL alone contributed no
// extractable structured data at all. FEA-101 (human decision 2026-07-21)
// changed that WITHOUT adding billing or credentials: lib/pipeline/gbp-live.ts
// opens the pasted listing with the Playwright build this repo already ships
// and reads the public place panel. Corroborating search context still comes
// from the shared Tavily findability call the orchestrator runs once per audit
// — this module still does NOT open a second Tavily client (see
// docs/CONTRACTS.md).
//
// Precedence (never fabricated): manual entry > live Maps read > screenshot
// vision-extraction > a bare Maps link (which by itself still contributes no
// fields). Live sits above the screenshot tier because it is a direct DOM read
// of the listing rather than a model's reading of a picture of it.

import { runGbpExtraction } from "../agents/experts";
import { fetchLiveGbp, type LiveGbpData, type LiveGbpResult } from "./gbp-live";
import type { BusinessInput, GbpEvidence, GbpExtractionOutput } from "../schemas";

/** Mirrors `BusinessInput["gbp_manual"]` exactly (imported, not redeclared)
 *  so this module can never drift from the frozen schema. */
export type GbpManualInput = NonNullable<BusinessInput["gbp_manual"]>;

export interface CollectGbpEvidenceInput {
  mapsUrl?: string | null;
  gbpManual?: GbpManualInput | null;
  screenshotDataUrls: string[];
  /** FEA-101: reserved corroboration context, forwarded to the live read but
   *  never used to invent a field (see gbp-live.ts). */
  brandName: string;
  trade: string;
  city?: string | null;
  /** FEA-101 opt-in. The REPLAY branch never calls this module at all, so a
   *  replayed demo can never trigger a live browser visit; this flag exists so
   *  tests and any future non-live caller can suppress it explicitly. */
  allowLiveFetch?: boolean;
  /** Injected for tests — defaults to the real Playwright-backed read. */
  fetchLive?: (mapsUrl: string) => Promise<LiveGbpResult>;
}

function manualHasAnyField(manual: GbpManualInput | null | undefined): manual is GbpManualInput {
  if (!manual) return false;
  return manual.review_count !== undefined || manual.rating !== undefined || manual.description !== undefined;
}

function extractedHasAnyField(extracted: GbpExtractionOutput | null): extracted is GbpExtractionOutput {
  if (!extracted) return false;
  return (
    extracted.review_count !== null ||
    extracted.rating !== null ||
    extracted.has_photo_reviews !== null ||
    extracted.description !== null
  );
}

function liveHasAnyField(live: LiveGbpData | null): live is LiveGbpData {
  if (!live) return false;
  return (
    live.rating !== null ||
    live.review_count !== null ||
    live.phone !== null ||
    live.opening_hours_text !== null ||
    live.has_listing_photos !== null ||
    live.review_snippets.length > 0
  );
}

export interface MergeGbpPrecedenceExtras {
  live?: LiveGbpData | null;
  liveFetchedAt?: string | null;
  liveError?: { reason: string; detail: string } | null;
}

/**
 * Pure precedence merge (F-025 + FEA-101): manual field-by-field values win
 * over live Maps values, which win over screenshot-extracted values; a bare
 * Maps link with none of them contributes no fields at all. `source` reflects
 * the highest-precedence origin that supplied at least one of the three
 * ORIGINAL fields and keeps its three frozen values — a live read is marked by
 * `live_source: "live_maps"` instead, so existing `source` consumers are
 * unaffected. Returns `null` only when there is truly no GBP signal whatsoever
 * (no manual data, no live data, no screenshot data, no Maps link) — exported
 * separately so the merge is testable without any I/O.
 */
export function mergeGbpPrecedence(
  manual: GbpManualInput | null | undefined,
  extracted: GbpExtractionOutput | null,
  hasMapsLink: boolean,
  extras: MergeGbpPrecedenceExtras = {}
): GbpEvidence | null {
  const manualOk = manualHasAnyField(manual);
  const extractedOk = extractedHasAnyField(extracted);
  const live = extras.live ?? null;
  const liveOk = liveHasAnyField(live);

  if (!manualOk && !extractedOk && !liveOk && !hasMapsLink) return null;

  const review_count = manual?.review_count ?? live?.review_count ?? extracted?.review_count ?? undefined;
  const rating = manual?.rating ?? live?.rating ?? extracted?.rating ?? undefined;
  const description = manual?.description ?? extracted?.description ?? undefined;
  // has_photo_reviews has no manual-input equivalent (BusinessInput.gbp_manual
  // carries no such field) — vision extraction is the only possible source.
  // The live read's `has_listing_photos` is a DIFFERENT fact (does the listing
  // show photos at all) and is kept as its own field rather than conflated.
  const has_photo_reviews = extracted?.has_photo_reviews ?? undefined;

  const source: GbpEvidence["source"] = manualOk ? "manual" : extractedOk ? "screenshot" : "link";

  return {
    ...(review_count !== undefined && review_count !== null ? { review_count } : {}),
    ...(rating !== undefined && rating !== null ? { rating } : {}),
    ...(has_photo_reviews !== undefined && has_photo_reviews !== null ? { has_photo_reviews } : {}),
    ...(description !== undefined && description !== null ? { description } : {}),
    source,
    ...(liveOk
      ? {
          phone: live.phone,
          opening_hours_text: live.opening_hours_text,
          has_listing_photos: live.has_listing_photos,
          ...(live.review_snippets.length > 0 ? { review_snippets: live.review_snippets } : {}),
          live_source: "live_maps" as const,
          ...(extras.liveFetchedAt ? { live_fetched_at: extras.liveFetchedAt } : {}),
          ...(live.limited_view ? { live_limited_view: true } : {}),
        }
      : {}),
    ...(extras.liveError ? { live_error: extras.liveError } : {}),
  };
}

/**
 * Runs the live Maps read (FEA-101) and the GBP screenshot vision-extraction
 * (if any screenshots were given) and merges both with manual input by
 * precedence (F-024/F-025). Never throws: any live-read or vision failure
 * degrades honestly — the structured failure `reason` is recorded on the
 * evidence as `live_error` rather than being silently swallowed, and the audit
 * completes either way. GBP context is supplementary, not one of the scored
 * T1-T8/I1-I6 criteria, so it follows the same soft-failure contract as the
 * rest of Stage 1 evidence gathering (tavily.ts/website.ts/images.ts).
 */
export async function collectGbpEvidence(input: CollectGbpEvidenceInput): Promise<GbpEvidence | null> {
  const fetchLive =
    input.fetchLive ??
    ((mapsUrl: string) =>
      fetchLiveGbp({ mapsUrl, brandName: input.brandName, trade: input.trade, city: input.city ?? null }));

  const [extracted, liveResult] = await Promise.all([
    (async (): Promise<GbpExtractionOutput | null> => {
      if (input.screenshotDataUrls.length === 0) return null;
      try {
        return await runGbpExtraction({ screenshots: input.screenshotDataUrls });
      } catch {
        return null;
      }
    })(),
    (async (): Promise<LiveGbpResult | null> => {
      if (!input.mapsUrl || input.allowLiveFetch === false) return null;
      try {
        return await fetchLive(input.mapsUrl);
      } catch (error) {
        // fetchLiveGbp is contractually non-throwing; this guards a future bug
        // in that contract rather than today's implementation.
        return {
          ok: false,
          execution_mode: "HANDOFF_REQUIRED",
          reason: "fetch_failed",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    })(),
  ]);

  return mergeGbpPrecedence(input.gbpManual, extracted, Boolean(input.mapsUrl), {
    live: liveResult?.ok ? liveResult.data : null,
    liveFetchedAt: liveResult?.ok ? liveResult.fetched_at : null,
    liveError:
      liveResult && !liveResult.ok ? { reason: liveResult.reason, detail: liveResult.detail } : null,
  });
}
