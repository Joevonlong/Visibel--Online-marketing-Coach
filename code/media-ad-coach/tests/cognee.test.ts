// Tests for lib/memory/cognee.ts (F-090). No network calls — fetch is
// injected per call, so every case here exercises the real gating/timeout/
// error-handling logic against a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAuditMemory, findSimilarAudits } from "../lib/memory/cognee";

const ORIGINAL_URL = process.env.COGNEE_API_URL;
const ORIGINAL_KEY = process.env.COGNEE_API_KEY;
const ORIGINAL_AUTH_MODE = process.env.COGNEE_AUTH_MODE;
const ORIGINAL_DATASET = process.env.COGNEE_DATASET_NAME;

beforeEach(() => {
  delete process.env.COGNEE_API_URL;
  delete process.env.COGNEE_API_KEY;
  delete process.env.COGNEE_AUTH_MODE;
  delete process.env.COGNEE_DATASET_NAME;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.COGNEE_API_URL;
  else process.env.COGNEE_API_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.COGNEE_API_KEY;
  else process.env.COGNEE_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_AUTH_MODE === undefined) delete process.env.COGNEE_AUTH_MODE;
  else process.env.COGNEE_AUTH_MODE = ORIGINAL_AUTH_MODE;
  if (ORIGINAL_DATASET === undefined) delete process.env.COGNEE_DATASET_NAME;
  else process.env.COGNEE_DATASET_NAME = ORIGINAL_DATASET;
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Disabled without COGNEE_API_URL — byte-identical to "no memory" (F-090)
// ---------------------------------------------------------------------------

describe("cognee — disabled without COGNEE_API_URL", () => {
  it("addAuditMemory resolves without calling fetch", async () => {
    const fetchMock = vi.fn();
    await expect(
      addAuditMemory(
        { brand_name: "Acme Plumbing", trade: "plumber", overall_score: 50, top_finding_titles: [] },
        fetchMock as unknown as typeof fetch
      )
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("findSimilarAudits returns null without calling fetch", async () => {
    const fetchMock = vi.fn();
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("COGNEE_API_URL set to an empty string still counts as disabled", async () => {
    process.env.COGNEE_API_URL = "   ";
    const fetchMock = vi.fn();
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Enabled — happy paths against an injected fetch
// ---------------------------------------------------------------------------

describe("cognee — enabled with COGNEE_API_URL", () => {
  beforeEach(() => {
    process.env.COGNEE_API_URL = "https://cognee.example.test";
  });

  it("addAuditMemory posts multipart data to /api/v1/remember so the audit is searchable immediately", async () => {
    process.env.COGNEE_API_KEY = "test-key";
    process.env.COGNEE_DATASET_NAME = "demo-audits";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));

    const stored = await addAuditMemory(
      {
        brand_name: "Acme Plumbing",
        trade: "plumber",
        city: "Berlin",
        overall_score: 62,
        text_score: 40,
        image_score: 70,
        top_finding_titles: ["Headline & first impression", "Call-to-action & contact path"],
        audit_id: "audit-live-1",
        weaknesses: [
          { channel_id: "hero_headline", title: "Headline & first impression", lane: "text", severity: "high" },
        ],
        improvements: [
          { channel_id: "hero_headline", title: "Headline & first impression" },
        ],
      },
      fetchMock as unknown as typeof fetch
    );
    expect(stored).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(endpoint).toBe("https://cognee.example.test/api/v1/remember");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Api-Key"]).toBe("test-key");
    expect(init.headers["content-type"]).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("datasetName")).toBe("demo-audits");
    const data = body.get("data") as Blob;
    expect(await data.text()).toContain("Acme Plumbing");
    expect(await data.text()).toContain("Berlin");
    expect(await data.text()).toContain("Lane scores: text 40/100, images 70/100. Weakest lane: text");
    expect(await data.text()).toContain("Headline & first impression");
    const memory = JSON.parse(await data.text());
    expect(memory).toMatchObject({
      record_type: "visibel_audit",
      audit_id: "audit-live-1",
      scores: { overall: 62, text: 40, images: 70, weakest_lane: "text" },
      weaknesses: [{ channel_id: "hero_headline", lane: "text", severity: "high" }],
      improvements: [{ channel_id: "hero_headline" }],
    });
  });

  it("addAuditMemory omits the Authorization header when no key is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await addAuditMemory(
      { brand_name: "Acme", trade: "plumber", overall_score: 10, top_finding_titles: [] },
      fetchMock as unknown as typeof fetch
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["X-Api-Key"]).toBeUndefined();
  });

  it("supports Bearer auth for configured compatible deployments", async () => {
    process.env.COGNEE_API_KEY = "self-hosted-key";
    process.env.COGNEE_AUTH_MODE = "bearer";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await addAuditMemory(
      { brand_name: "Acme", trade: "plumber", overall_score: 10, top_finding_titles: [] },
      fetchMock as unknown as typeof fetch
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe("Bearer self-hosted-key");
  });

  it("rejects an LLM-authored summary that has no raw stored-audit provenance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 3, weakest_lane: "images" }));

    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);

    expect(result).toBeNull();
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://cognee.example.test/api/v1/search");
    const body = JSON.parse(init.body as string);
    expect(body.query).toContain("plumber");
    expect(body.query).toContain("Berlin");
    expect(body.searchType).toBe("CHUNKS");
    expect(body.datasets).toEqual(["visibel-audits"]);
  });

  it("computes the comparison only from raw stored audit records returned as chunks", async () => {
    const records = [
      {
        record_type: "visibel_audit",
        audit_id: "audit-live-1",
        business: { trade: "roofing", city: null },
        scores: { weakest_lane: "text" },
        weaknesses: [{ title: "Headline & first impression" }],
        improvements: [{ channel_id: "hero_headline" }],
      },
      {
        record_type: "visibel_audit",
        audit_id: "audit-live-2",
        business: { trade: "roofing", city: null },
        scores: { weakest_lane: "text" },
        weaknesses: [{ title: "Headline & first impression" }],
        improvements: [{ channel_id: "hero_headline" }],
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(records.map((record, index) => ({ id: `chunk-${index}`, text: JSON.stringify(record) })))
    );
    const result = await findSimilarAudits("roofing", null, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({
      count: 2,
      weakest_lane: "text",
      audit_ids: ["audit-live-1", "audit-live-2"],
      shared_weaknesses: ["Headline & first impression"],
      successful_improvements: ["hero_headline"],
      explanation: "2 stored audits were retrieved; text was the most common weakest lane.",
    });
  });

  it("findSimilarAudits omits city from the query when not given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    await findSimilarAudits("handyman", undefined, fetchMock as unknown as typeof fetch);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.query).toContain("handyman businesses");
  });

  it("parses Cognee's dataset-wrapped CHUNKS response", async () => {
    const record = {
      record_type: "visibel_audit",
      audit_id: "audit-live-4",
      business: { trade: "plumber", city: "Berlin" },
      scores: { weakest_lane: "images" },
      weaknesses: [],
      improvements: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      { dataset_name: "visibel-audits", search_result: [{ id: "chunk-4", text: JSON.stringify(record) }] },
    ]));
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toMatchObject({ count: 1, weakest_lane: "images", audit_ids: ["audit-live-4"] });
  });

  it("preserves explainable shared weaknesses and successful improvements from a real Cognee result", async () => {
    const makeRecord = (id: string) => ({
      record_type: "visibel_audit",
      audit_id: id,
      business: { trade: "plumber", city: "Berlin" },
      scores: { weakest_lane: "text" },
      weaknesses: [
        { title: "Headline & first impression" },
        { title: "Call-to-action & contact path" },
      ],
      improvements: [{ channel_id: "hero_headline" }],
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      { id: "chunk-1", text: JSON.stringify(makeRecord("audit-live-1")) },
      { id: "chunk-2", text: JSON.stringify(makeRecord("audit-live-2")) },
      { id: "chunk-3", text: JSON.stringify(makeRecord("audit-live-3")) },
    ]));

    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({
      count: 3,
      weakest_lane: "text",
      audit_ids: ["audit-live-1", "audit-live-2", "audit-live-3"],
      shared_weaknesses: ["Headline & first impression", "Call-to-action & contact path"],
      successful_improvements: ["hero_headline"],
      explanation: "3 stored audits were retrieved; text was the most common weakest lane.",
    });
  });

  // -------------------------------------------------------------------------
  // Failure paths — every one must resolve silently, never throw
  // -------------------------------------------------------------------------

  it("addAuditMemory: network error is silent (resolves, never throws)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      addAuditMemory(
        { brand_name: "Acme", trade: "plumber", overall_score: 10, top_finding_titles: [] },
        fetchMock as unknown as typeof fetch
      )
    ).resolves.toBe(false);
  });

  it("addAuditMemory: non-2xx response is silent (resolves, never throws)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    await expect(
      addAuditMemory(
        { brand_name: "Acme", trade: "plumber", overall_score: 10, top_finding_titles: [] },
        fetchMock as unknown as typeof fetch
      )
    ).resolves.toBe(false);
  });

  it("findSimilarAudits: timeout/abort error resolves to null, never throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"));
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("findSimilarAudits: non-2xx response resolves to null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 5, weakest_lane: "images" }, false, 500));
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("findSimilarAudits: ambiguous response resolves to null (never renders from a non-real hit)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: "world" }));
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("findSimilarAudits: count of 0 resolves to null (no real hit)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 0, weakest_lane: "images" }));
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("findSimilarAudits: empty results array resolves to null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("findSimilarAudits: malformed JSON body resolves to null, never throws", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);
    const result = await findSimilarAudits("plumber", "Berlin", fetchMock as unknown as typeof fetch);
    expect(result).toBeNull();
  });
});
