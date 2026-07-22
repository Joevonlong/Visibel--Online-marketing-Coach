// F-090 — Cognee memory wrapper (plan §5.7, feature-breakdown F-090/F-091).
// P1, "must attempt", deliberately simple: two wrapped calls, both
// non-blocking. With no COGNEE_API_URL set, both functions are instant
// no-ops — pipeline behavior must be byte-identical to "no memory" (F-090
// accept criterion). EVERY failure path (missing config, timeout, network
// error, non-2xx, unparseable/ambiguous response) resolves silently
// (add -> resolve, find -> null) — this module must never throw and never
// block the analyze pipeline.
//
// Request shapes follow Cognee's v1 API: multipart /api/v1/remember and JSON
// /api/v1/search. Live venue credentials remain outside the repository.

const TIMEOUT_MS = 10_000;

export interface AuditMemorySummary {
  audit_id?: string;
  brand_name: string;
  trade: string;
  city?: string | null;
  overall_score: number;
  text_score?: number;
  image_score?: number;
  top_finding_titles: string[];
  weaknesses?: Array<{
    channel_id: string;
    title: string;
    lane: string;
    severity: string;
  }>;
  improvements?: Array<{
    channel_id: string;
    title: string;
    result_summary?: string;
  }>;
}

export interface SimilarAuditsResult {
  count: number;
  weakest_lane: string;
  audit_ids: string[];
  shared_weaknesses?: string[];
  successful_improvements?: string[];
  explanation?: string;
}

/** Injectable fetch so tests never touch the network — mirrors the `client`
 *  injection seam in lib/agents/openai.ts's structuredCall. */
export type FetchLike = typeof fetch;

function isEnabled(): boolean {
  const url = process.env.COGNEE_API_URL;
  return Boolean(url && url.trim().length > 0);
}

function authHeaders(): Record<string, string> {
  const key = process.env.COGNEE_API_KEY;
  if (!key || key.trim().length === 0) return {};
  return process.env.COGNEE_AUTH_MODE?.trim().toLowerCase() === "bearer"
    ? { Authorization: `Bearer ${key}` }
    : { "X-Api-Key": key };
}

function datasetName(): string {
  return process.env.COGNEE_DATASET_NAME?.trim() || "visibel-audits";
}

function describeCause(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ---------------------------------------------------------------------------
// addAuditMemory — fire-and-forget after a completed audit (F-090/§5.7)
// ---------------------------------------------------------------------------

function buildAddRequest(baseUrl: string, audit: AuditMemorySummary): { endpoint: string; body: FormData } {
  const weakestLane =
    audit.text_score === undefined || audit.image_score === undefined
      ? null
      : audit.text_score <= audit.image_score
        ? "text"
        : "images";
  const summary = [
    `Business: ${audit.brand_name} (${audit.trade}${audit.city ? `, ${audit.city}` : ""})`,
    `Overall score: ${audit.overall_score}/100`,
    audit.text_score === undefined || audit.image_score === undefined
      ? null
      : `Lane scores: text ${audit.text_score}/100, images ${audit.image_score}/100. Weakest lane: ${weakestLane}`,
    `Top findings: ${audit.top_finding_titles.length > 0 ? audit.top_finding_titles.join("; ") : "none"}`,
  ].filter((line): line is string => line !== null).join(". ");

  const memoryRecord = {
    record_type: "visibel_audit",
    audit_id: audit.audit_id ?? null,
    business: {
      brand_name: audit.brand_name,
      trade: audit.trade,
      city: audit.city ?? null,
    },
    scores: {
      overall: audit.overall_score,
      text: audit.text_score ?? null,
      images: audit.image_score ?? null,
      weakest_lane: weakestLane,
    },
    top_finding_titles: audit.top_finding_titles,
    weaknesses: audit.weaknesses ?? [],
    improvements: audit.improvements ?? [],
    summary,
  };

  const body = new FormData();
  body.append(
    "data",
    new Blob([JSON.stringify(memoryRecord, null, 2)], { type: "application/json" }),
    `audit-memory-${audit.audit_id ?? "summary"}.json`,
  );
  body.append("datasetName", datasetName());
  return { endpoint: `${baseUrl.replace(/\/$/, "")}/api/v1/remember`, body };
}

/**
 * Records and processes a light-touch memory summary of a completed audit
 * through Cognee's single-call `remember` endpoint, so the new audit is
 * available to search without a separate cognify request. Enabled only
 * when COGNEE_API_URL is set (COGNEE_API_KEY is optional; cloud uses
 * X-Api-Key by default, with COGNEE_AUTH_MODE=bearer for compatible
 * self-hosted deployments). Never throws; every failure is logged via
 * console.warn and swallowed, never surfaced to the caller.
 */
export async function addAuditMemory(audit: AuditMemorySummary, fetchImpl: FetchLike = fetch): Promise<boolean> {
  if (!isEnabled()) return false;
  const baseUrl = process.env.COGNEE_API_URL as string;

  try {
    const { endpoint, body } = buildAddRequest(baseUrl, audit);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: authHeaders(),
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`cognee addAuditMemory: non-2xx response ${response.status} (non-blocking)`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`cognee addAuditMemory failed (non-blocking): ${describeCause(error)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// findSimilarAudits — called at analyze start (F-090/§5.7)
// ---------------------------------------------------------------------------

function buildSearchRequest(baseUrl: string, trade: string, city?: string | null): { endpoint: string; body: unknown } {
  const subject = city ? `${trade} businesses in ${city}` : `${trade} businesses`;
  const query = `${subject}. Retrieve the raw stored audit memory records that match this trade and location.`;
  return {
    endpoint: `${baseUrl.replace(/\/$/, "")}/api/v1/search`,
    // CHUNKS returns retrieved source text instead of an LLM-authored answer.
    // That distinction is the F-091 truth boundary: memory UI must be derived
    // from actual stored audit records, never from a plausible completion.
    body: { query, searchType: "CHUNKS", datasets: [datasetName()], topK: 10 },
  };
}

/**
 * Anything short of a raw stored record with its own audit id resolves to
 * null. Cognee CHUNKS responses may be a plain list of chunks or dataset-
 * wrapped under `search_result`; both contain raw `text`, which is parsed and
 * verified locally. Counts and explanations are computed here, never trusted
 * from model prose.
 */
interface RetrievedAuditRecord {
  auditId: string;
  weakestLane: string;
  weaknessTitles: string[];
  improvementIds: string[];
}

function parseStoredRecord(
  value: unknown,
  expectedTrade: string,
  expectedCity?: string | null,
): RetrievedAuditRecord | null {
  if (typeof value === "string") {
    try {
      return parseStoredRecord(JSON.parse(value), expectedTrade, expectedCity);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (obj.record_type !== "visibel_audit" || typeof obj.audit_id !== "string" || !obj.audit_id.trim()) return null;
  if (!obj.business || typeof obj.business !== "object" || !obj.scores || typeof obj.scores !== "object") return null;
  const business = obj.business as Record<string, unknown>;
  const scores = obj.scores as Record<string, unknown>;
  const normalize = (item: unknown) => typeof item === "string" ? item.trim().toLowerCase() : "";
  if (normalize(business.trade) !== normalize(expectedTrade)) return null;
  if (expectedCity && normalize(business.city) !== normalize(expectedCity)) return null;
  if (typeof scores.weakest_lane !== "string" || !scores.weakest_lane.trim()) return null;
  const weaknesses = Array.isArray(obj.weaknesses) ? obj.weaknesses : [];
  const improvements = Array.isArray(obj.improvements) ? obj.improvements : [];
  return {
    auditId: obj.audit_id.trim(),
    weakestLane: scores.weakest_lane.trim(),
    weaknessTitles: weaknesses.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const title = (item as Record<string, unknown>).title;
      return typeof title === "string" && title.trim() ? [title.trim()] : [];
    }),
    improvementIds: improvements.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const id = (item as Record<string, unknown>).channel_id;
      return typeof id === "string" && id.trim() ? [id.trim()] : [];
    }),
  };
}

function collectChunkTexts(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) return [];
  const texts: unknown[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.text === "string") texts.push(obj.text);
    if (Array.isArray(obj.search_result)) {
      for (const result of obj.search_result) {
        if (result && typeof result === "object" && typeof (result as Record<string, unknown>).text === "string") {
          texts.push((result as Record<string, unknown>).text);
        }
      }
    }
  }
  return texts;
}

function parseSimilarAuditsResponse(
  payload: unknown,
  trade: string,
  city?: string | null,
): SimilarAuditsResult | null {
  const recordsById = new Map<string, RetrievedAuditRecord>();
  for (const text of collectChunkTexts(payload)) {
    const record = parseStoredRecord(text, trade, city);
    if (record) recordsById.set(record.auditId, record);
  }
  const records = [...recordsById.values()];
  if (records.length === 0) return null;

  const countValues = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  };
  const laneCounts = countValues(records.map((record) => record.weakestLane));
  const weakestLane = [...laneCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  const weaknessCounts = countValues(records.flatMap((record) => record.weaknessTitles));
  const sharedThreshold = records.length > 1 ? 2 : 1;
  const sharedWeaknesses = [...weaknessCounts.entries()]
    .filter(([, count]) => count >= sharedThreshold)
    .map(([title]) => title);
  const successfulImprovements = [...new Set(records.flatMap((record) => record.improvementIds))];
  const result: SimilarAuditsResult = {
    count: records.length,
    weakest_lane: weakestLane,
    audit_ids: records.map((record) => record.auditId),
    explanation: `${records.length} stored audit${records.length === 1 ? " was" : "s were"} retrieved; ${weakestLane} was the most common weakest lane.`,
  };
  if (sharedWeaknesses.length > 0) result.shared_weaknesses = sharedWeaknesses;
  if (successfulImprovements.length > 0) result.successful_improvements = successfulImprovements;
  return result;
}

/**
 * Looks up similar previously-audited businesses by trade (+ city). Enabled
 * only when COGNEE_API_URL is set; disabled, timed-out, errored, non-2xx, or
 * ambiguous responses all resolve to `null` — never throws.
 */
export async function findSimilarAudits(
  trade: string,
  city?: string | null,
  fetchImpl: FetchLike = fetch
): Promise<SimilarAuditsResult | null> {
  if (!isEnabled()) return null;
  const baseUrl = process.env.COGNEE_API_URL as string;

  try {
    const { endpoint, body } = buildSearchRequest(baseUrl, trade, city);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return parseSimilarAuditsResponse(payload, trade, city);
  } catch (error) {
    console.warn(`cognee findSimilarAudits failed (non-blocking): ${describeCause(error)}`);
    return null;
  }
}
