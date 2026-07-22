import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import fixture from "../lib/fixtures/replay-audit.json";
import { Report } from "../lib/schemas";

let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "media-ad-pdf-"));
  process.env.APP_DB_PATH = join(tempDir, "app.db");
  const db = await import("../lib/db");
  db.closeDb();
});

afterEach(async () => {
  const db = await import("../lib/db");
  db.closeDb();
  delete process.env.APP_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("report PDF export", () => {
  it("builds a printable, escaped report from the persisted score evidence", async () => {
    const { buildReportHtml } = await import("../lib/export/report-pdf");
    const report = Report.parse(fixture.report);
    const html = buildReportHtml({
      auditId: "audit-123",
      brandName: "Krause <Plumbing>",
      city: "Berlin & Potsdam",
      createdAt: "2026-07-18T12:00:00.000Z",
      report,
    });

    expect(html).toContain("Krause &lt;Plumbing&gt;");
    expect(html).toContain("Berlin &amp; Potsdam");
    expect(html).toContain(`>${report.overall_score}<`);
    expect(html).toContain("Text score");
    expect(html).toContain("Image score");
    expect(html).toContain(report.findings[0]!.evidence_quote.replaceAll("&", "&amp;"));
    expect(html).not.toContain("Krause <Plumbing>");
  });

  it("returns honest errors when an audit or scored report is unavailable", async () => {
    const db = await import("../lib/db");
    const { GET } = await import("../app/api/audits/[id]/report/route");

    const missing = await GET(new Request("http://test/report"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(missing.status).toBe(404);

    const draft = db.createAudit({ business_json: { brand_name: "Draft" } });
    const notReady = await GET(new Request("http://test/report"), {
      params: Promise.resolve({ id: draft.id }),
    });
    expect(notReady.status).toBe(409);
  });

  it("downloads an A4 PDF for a persisted scored report", async () => {
    const db = await import("../lib/db");
    const { GET } = await import("../app/api/audits/[id]/report/route");
    const report = Report.parse(fixture.report);
    const audit = db.createAudit({
      business_json: { brand_name: "Sanitär Krause Berlin", city: "Berlin" },
      execution_mode: "REPLAY",
    });
    db.updateAudit(audit.id, { report_json: report, overall_score: report.overall_score, status: "scored" });

    const response = await GET(new Request("http://test/report"), {
      params: Promise.resolve({ id: audit.id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("Sanita-r-Krause-Berlin-report.pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
