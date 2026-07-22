import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import fixture from "../lib/fixtures/replay-audit.json";
import { GET as getAudit_GET } from "../app/api/audits/[id]/route";
import { POST as analyze_POST } from "../app/api/audits/[id]/analyze/route";
import { runAnalyzeAndRecordFailure } from "../lib/server/runners";
import { POST as assets_POST } from "../app/api/audits/[id]/assets/route";
import { GET as history_GET, POST as create_POST } from "../app/api/audits/route";

let tmpDir: string;
let storageDir: string;

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const VALID_BUSINESS = {
  brand_name: "Acme Plumbing",
  trade: "plumber",
  city: "Berlin",
  presence: { website: "https://acme-plumbing.example" },
};

function pngFile(name = "test.png"): File {
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  return new File([pngBytes], name, { type: "image/png" });
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-api-test-"));
  storageDir = join(tmpDir, "storage");
  process.env.APP_DB_PATH = join(tmpDir, "app.db");
  process.env.APP_STORAGE_DIR = storageDir;
  // Same pattern as tests/db.test.ts: the lazy singleton in lib/db.ts only
  // re-reads APP_DB_PATH after closeDb() clears it, and every route handler
  // above resolves to that same cached module instance.
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
});

afterEach(async () => {
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
  delete process.env.APP_DB_PATH;
  delete process.env.APP_STORAGE_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /api/audits (F-040)", () => {
  it("creates a draft audit for a valid body", async () => {
    const res = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { auditId: string };
    expect(body.auditId).toBeTruthy();

    const { getAudit } = await import("../lib/db");
    const row = getAudit(body.auditId);
    expect(row?.status).toBe("draft");
    expect(row?.execution_mode).toBe("LIVE");
    expect((row?.business_json as { brand_name: string }).brand_name).toBe("Acme Plumbing");
  });

  it("rejects an invalid body (fails BusinessInput) with a readable 400 message", async () => {
    const res = await create_POST(
      jsonRequest("http://localhost/api/audits", { trade: "not-a-real-trade", presence: {} })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/brand_name|trade/);
  });

  it("rejects empty presence + no pasted_text without has_attachments", async () => {
    const res = await create_POST(
      jsonRequest("http://localhost/api/audits", {
        brand_name: "No Signal Co",
        trade: "handyman",
        presence: {},
      })
    );
    expect(res.status).toBe(400);
  });

  it("accepts empty presence + no pasted_text when has_attachments is true", async () => {
    const res = await create_POST(
      jsonRequest("http://localhost/api/audits", {
        brand_name: "Attachments Later Co",
        trade: "handyman",
        presence: {},
        has_attachments: true,
      })
    );
    expect(res.status).toBe(201);
  });

  it("ignores DEMO_MODE=replay for a user-submitted audit — REPLAY is per-request opt-in only", async () => {
    process.env.DEMO_MODE = "replay";
    try {
      const res = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
      const body = (await res.json()) as { auditId: string };
      const { getAudit } = await import("../lib/db");
      expect(getAudit(body.auditId)?.execution_mode).toBe("LIVE");
    } finally {
      delete process.env.DEMO_MODE;
    }
  });

  it('creates a REPLAY audit when the body sets mode:"replay", regardless of DEMO_MODE', async () => {
    expect(process.env.DEMO_MODE).toBeUndefined();
    const res = await create_POST(jsonRequest("http://localhost/api/audits", { ...VALID_BUSINESS, mode: "replay" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { auditId: string };
    const { getAudit } = await import("../lib/db");
    expect(getAudit(body.auditId)?.execution_mode).toBe("REPLAY");
  });

  it("creates a LIVE audit when mode is omitted and DEMO_MODE is unset", async () => {
    expect(process.env.DEMO_MODE).toBeUndefined();
    const res = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const body = (await res.json()) as { auditId: string };
    const { getAudit } = await import("../lib/db");
    expect(getAudit(body.auditId)?.execution_mode).toBe("LIVE");
  });
});

describe("GET /api/audits (F-046)", () => {
  it("returns history rows newest first", async () => {
    const first = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const firstId = ((await first.json()) as { auditId: string }).auditId;
    // listAudits() (lib/db.ts) orders by `ORDER BY created_at DESC` with no
    // tiebreaker; created_at is millisecond-resolution, so two creates in
    // the same millisecond can come back in either order. This delay is a
    // test-only workaround — see the report back to the db-env owner about
    // adding a secondary sort key (e.g. rowid) for real concurrent creates.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await create_POST(
      jsonRequest("http://localhost/api/audits", { ...VALID_BUSINESS, brand_name: "Second Co" })
    );
    const secondId = ((await second.json()) as { auditId: string }).auditId;

    const res = await history_GET();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      id: string;
      brand_name: string;
      trade: string;
      status: string;
      execution_mode: string;
      overall_score: number | null;
    }>;

    expect(rows.map((r) => r.id)).toEqual([secondId, firstId]);
    expect(rows[0].brand_name).toBe("Second Co");
    expect(rows[1].trade).toBe("plumber");
    expect(rows[0].status).toBe("draft");
    expect(rows[0].overall_score).toBeNull();
  });
});

describe("POST /api/audits/:id/assets (F-041)", () => {
  it("404s for an unknown audit", async () => {
    const req = new Request("http://localhost/api/audits/does-not-exist/assets", { method: "POST" });
    const res = await assets_POST(req, idParams("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("stores a small in-memory png on disk and creates an asset row", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const formData = new FormData();
    formData.append("files", pngFile());
    const req = new Request(`http://localhost/api/audits/${auditId}/assets`, { method: "POST", body: formData });

    const res = await assets_POST(req, idParams(auditId));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { assetIds: string[] };
    expect(body.assetIds).toHaveLength(1);

    const { listAssets } = await import("../lib/db");
    const assets = listAssets(auditId);
    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe("uploaded_image");
    expect(assets[0].status).toBe("uploaded");
    // storage_path is relative to the storage root (APP_STORAGE_DIR here),
    // not a literal "storage/..." prefix — see the route's comment. Resolve
    // it the same way a real consumer (e.g. the orchestrator) would.
    expect(assets[0].storage_path).toMatch(new RegExp(`^uploads[\\\\/]${auditId}[\\\\/][^\\\\/]+$`));

    const diskPath = join(storageDir, assets[0].storage_path!);
    expect(existsSync(diskPath)).toBe(true);
  });

  it("accepts kind=gbp_screenshot", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const formData = new FormData();
    formData.append("files", pngFile("screenshot.png"));
    formData.append("kind", "gbp_screenshot");
    const req = new Request(`http://localhost/api/audits/${auditId}/assets`, { method: "POST", body: formData });

    const res = await assets_POST(req, idParams(auditId));
    expect(res.status).toBe(201);

    const { listAssets } = await import("../lib/db");
    expect(listAssets(auditId)[0].kind).toBe("gbp_screenshot");
  });

  it("rejects more than 10 files", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const formData = new FormData();
    for (let i = 0; i < 11; i++) formData.append("files", pngFile(`f${i}.png`));
    const req = new Request(`http://localhost/api/audits/${auditId}/assets`, { method: "POST", body: formData });

    const res = await assets_POST(req, idParams(auditId));
    expect(res.status).toBe(400);

    const { listAssets } = await import("../lib/db");
    expect(listAssets(auditId)).toHaveLength(0);
  });

  it("rejects an unsupported mime type", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const formData = new FormData();
    formData.append("files", new File([Buffer.from("not an image")], "note.txt", { type: "text/plain" }));
    const req = new Request(`http://localhost/api/audits/${auditId}/assets`, { method: "POST", body: formData });

    const res = await assets_POST(req, idParams(auditId));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/audits/:id/analyze (F-042)", () => {
  it("404s for an unknown audit", async () => {
    const req = new Request("http://localhost/api/audits/does-not-exist/analyze", { method: "POST" });
    const res = await analyze_POST(req, idParams("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("409s when the audit is already analyzing", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;
    const { updateAudit } = await import("../lib/db");
    updateAudit(auditId, { status: "analyzing" });

    const req = new Request(`http://localhost/api/audits/${auditId}/analyze`, { method: "POST" });
    const res = await analyze_POST(req, idParams(auditId));
    expect(res.status).toBe(409);
  });

  it("409s when the audit is already improving", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;
    const { updateAudit } = await import("../lib/db");
    updateAudit(auditId, { status: "improving" });

    const req = new Request(`http://localhost/api/audits/${auditId}/analyze`, { method: "POST" });
    const res = await analyze_POST(req, idParams(auditId));
    expect(res.status).toBe(409);
  });

  it("400s with an honest message when there is nothing to analyze", async () => {
    const created = await create_POST(
      jsonRequest("http://localhost/api/audits", {
        brand_name: "Attachments Later Co",
        trade: "handyman",
        presence: {},
        has_attachments: true,
      })
    );
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const req = new Request(`http://localhost/api/audits/${auditId}/analyze`, { method: "POST" });
    const res = await analyze_POST(req, idParams(auditId));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/nothing to analyze/i);
  });

  it("succeeds once an asset is attached, even with empty presence/pasted_text", async () => {
    const created = await create_POST(
      jsonRequest("http://localhost/api/audits", {
        brand_name: "Attachments Later Co",
        trade: "handyman",
        presence: {},
        has_attachments: true,
      })
    );
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const formData = new FormData();
    formData.append("files", pngFile());
    await assets_POST(
      new Request(`http://localhost/api/audits/${auditId}/assets`, { method: "POST", body: formData }),
      idParams(auditId)
    );

    const req = new Request(`http://localhost/api/audits/${auditId}/analyze`, { method: "POST" });
    const res = await analyze_POST(req, idParams(auditId));
    expect(res.status).toBe(202);
  });

  it("returns 202 and immediately flips status to analyzing in the response body", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const req = new Request(`http://localhost/api/audits/${auditId}/analyze`, { method: "POST" });
    const res = await analyze_POST(req, idParams(auditId));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("analyzing");
  });

  it("records a real LIVE-pipeline failure as status=failed + a progress event with the honest error", async () => {
    // No OPENAI_API_KEY/TAVILY_API_KEY in the test env: every Stage-1
    // evidence helper degrades honestly (dead website, no Tavily key, no
    // GBP/images) and is non-fatal, so the pipeline walks every step through
    // Stage 3. Stage 2's experts hit their zero-evidence deterministic paths
    // (no model call needed). Stage 4 (Synthesizer) always makes a live
    // OpenAI call with no bypass, so that's where it genuinely fails — see
    // lib/pipeline/orchestrator.ts's header comment and lib/agents/openai.ts
    // getClient() for why this exact message.
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;
    const { getAudit, listProgressEvents, updateAudit } = await import("../lib/db");
    updateAudit(auditId, { status: "analyzing" });

    // Directly await the testable wrapper instead of racing POST's
    // fire-and-forget call — this is the exact promise POST starts but never
    // awaits.
    await runAnalyzeAndRecordFailure(auditId);

    expect(getAudit(auditId)?.status).toBe("failed");
    // Robust on purpose, not an exact-sequence/exact-string match: this
    // exercises the real Stage 1-4 pipeline (not a stub), so the intermediate
    // step list and the precise AgentCallError wording are implementation
    // details of lib/pipeline/orchestrator.ts / lib/agents/openai.ts that can
    // legitimately change without this contract test needing to change too.
    const steps = listProgressEvents(auditId).map((e) => e.step);
    expect(steps[0]).toBe("reading_site");
    expect(steps.at(-1)).toBe("failed");
    expect(steps.length).toBeGreaterThan(1);
    expect(listProgressEvents(auditId).find((e) => e.step === "failed")?.detail).toMatch(
      /OPENAI_API_KEY|AgentCallError/i
    );
  });
});

describe("GET /api/audits/:id (F-044)", () => {
  it("returns the draft shape (no report, no channels, not preview-ready)", async () => {
    const created = await create_POST(jsonRequest("http://localhost/api/audits", VALID_BUSINESS));
    const auditId = ((await created.json()) as { auditId: string }).auditId;

    const res = await getAudit_GET(new Request(`http://localhost/api/audits/${auditId}`), idParams(auditId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      status: "draft",
      execution_mode: "LIVE",
      progress: [],
      report: null,
      channels: null,
      before_screenshot: null,
      preview_ready: false,
      // FEA-112: the poller's own signal for images still generating after the
      // audit already reports "complete".
      images_pending: 0,
      overall_score: null,
    });
  });

  it("404s for an unknown audit", async () => {
    const res = await getAudit_GET(
      new Request("http://localhost/api/audits/does-not-exist"),
      idParams("does-not-exist")
    );
    expect(res.status).toBe(404);
  });

  it("returns report + channels once scored, using the REPLAY fixture", async () => {
    const { createAudit, replaceChannels, updateAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: fixture.business, execution_mode: "REPLAY" });

    updateAudit(audit.id, {
      status: "scored",
      report_json: fixture.report,
      overall_score: fixture.report.overall_score,
      evidence_json: {
        before_screenshot: {
          ok: true,
          execution_mode: "LIVE",
          storage_path: `screenshots/${audit.id}/before.png`,
          width: 1440,
          height: 900,
        },
      },
      preview_json: { header: { business_name: fixture.business.brand_name } },
    });
    replaceChannels(
      audit.id,
      fixture.report.channels.map((channel) => ({
        id: channel.id,
        lane: channel.lane,
        title: channel.title,
        one_liner: channel.one_liner,
        priority: channel.priority,
        severity: channel.severity,
        status: channel.status,
        findings_json: channel.finding_ids,
        before_json: channel.before,
        after_json: channel.after,
      }))
    );

    const res = await getAudit_GET(new Request(`http://localhost/api/audits/${audit.id}`), idParams(audit.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: typeof fixture.report;
      channels: Array<{ id: string; one_liner: string; finding_ids: string[]; before: unknown; after: unknown }>;
      preview_ready: boolean;
      before_screenshot: unknown;
      overall_score: number;
      status: string;
    };

    expect(body.status).toBe("scored");
    expect(body.overall_score).toBe(fixture.report.overall_score);
    expect(body.preview_ready).toBe(true);
    expect(body.before_screenshot).toEqual({
      ok: true,
      execution_mode: "LIVE",
      storage_path: `screenshots/${audit.id}/before.png`,
      width: 1440,
      height: 900,
    });
    expect(body.report).toEqual(fixture.report);

    expect(body.channels).toHaveLength(fixture.report.channels.length);
    expect(body.channels?.map((c) => c.id)).toEqual(fixture.report.channels.map((c) => c.id));
    const firstChannel = body.channels?.[0];
    const firstFixtureChannel = fixture.report.channels[0];
    expect(firstChannel?.one_liner).toBe(firstFixtureChannel.one_liner);
    expect(firstChannel?.finding_ids).toEqual(firstFixtureChannel.finding_ids);
    expect(firstChannel?.before).toEqual(firstFixtureChannel.before);
    expect(firstChannel?.after).toEqual(firstFixtureChannel.after);
  });
});
