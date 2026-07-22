import { getAudit } from "../../../../../lib/db";
import { renderReportPdf } from "../../../../../lib/export/report-pdf";
import { Report } from "../../../../../lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string): string {
  const base = value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "visibel"}-report.pdf`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const audit = getAudit(id);
  if (!audit) return Response.json({ error: "Audit not found." }, { status: 404 });

  const parsed = Report.safeParse(audit.report_json);
  if (!parsed.success) {
    return Response.json({ error: "The scored report is not ready for export." }, { status: 409 });
  }

  const business = (audit.business_json ?? {}) as { brand_name?: unknown; city?: unknown };
  const brandName = typeof business.brand_name === "string" ? business.brand_name : "Visibel";
  const city = typeof business.city === "string" ? business.city : null;
  const input = { auditId: id, brandName, city, createdAt: audit.created_at, report: parsed.data };

  try {
    const pdf = await renderReportPdf(input);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(brandName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // ISS-022: log the full error (with stack) — a swallowed message hid a missing
    // Playwright browser build behind a generic 503 for hours.
    console.error(`[pdf] export failed for audit ${id}: ${detail}`, error);
    const browserMissing = /Executable doesn't exist|playwright install/i.test(detail);
    if (browserMissing) {
      console.error(
        "[pdf] the Playwright browser build is missing — run `pnpm exec playwright install chromium`",
      );
    }
    return Response.json(
      {
        error: "PDF export is temporarily unavailable; the report remains available on screen.",
        ...(browserMissing ? { reason: "browser_unavailable" } : {}),
      },
      { status: 503 },
    );
  }
}
