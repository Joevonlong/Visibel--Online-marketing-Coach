import type { Report } from "../schemas";

export interface ReportPdfInput {
  auditId: string;
  brandName: string;
  city?: string | null;
  createdAt: string;
  report: Report;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function criterionRows(criteria: Report["text"]["criteria"]): string {
  return criteria
    .map(
      (criterion) => `<tr>
        <td><strong>${escapeHtml(criterion.id)}</strong></td>
        <td class="score-cell">${criterion.score}/5</td>
        <td>${escapeHtml(criterion.evidence)}</td>
        <td class="source">${escapeHtml(criterion.source)}</td>
      </tr>`,
    )
    .join("");
}

export function buildReportHtml(input: ReportPdfInput): string {
  const { report } = input;
  const findings = report.findings
    .map(
      (finding) => `<li class="finding finding-${escapeHtml(finding.severity)}">
        <div><strong>${escapeHtml(finding.criterion)}</strong> <span>${escapeHtml(finding.severity)}</span></div>
        <p>${escapeHtml(finding.evidence_quote)}</p>
      </li>`,
    )
    .join("");
  const channels = report.channels
    .filter((channel) => channel.id !== "promo_video")
    .map(
      (channel) => `<li><strong>${escapeHtml(channel.title)}</strong><br><span>${escapeHtml(channel.one_liner)}</span></li>`,
    )
    .join("");
  const disclaimers = report.disclaimers.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const created = Number.isNaN(Date.parse(input.createdAt))
    ? input.createdAt
    : new Date(input.createdAt).toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.brandName)} - Visibel report</title>
  <style>
    @page { size: A4; margin: 16mm 15mm 17mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171717; font: 12px/1.48 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 4px; font-size: 27px; letter-spacing: -0.6px; }
    h2 { margin: 0 0 10px; font-size: 17px; }
    .muted, .source { color: #666; }
    .eyebrow { margin-bottom: 8px; color: #6d28d9; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #ddd; }
    .meta { text-align: right; white-space: nowrap; }
    .score-band { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; margin: 18px 0; }
    .score-card { padding: 14px; border: 1px solid #ddd; border-radius: 12px; background: #fafafa; }
    .score-card.primary { color: white; border-color: #6d28d9; background: #6d28d9; }
    .score { font-size: 31px; font-weight: 750; line-height: 1; }
    .score-label { margin-top: 7px; font-size: 10px; font-weight: 650; text-transform: uppercase; }
    section { margin-top: 22px; break-inside: avoid; }
    .summary { padding: 15px 16px; border-radius: 12px; background: #f2efff; }
    table { width: 100%; border-collapse: collapse; }
    th { color: #666; font-size: 9px; text-align: left; text-transform: uppercase; }
    th, td { padding: 7px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
    .score-cell { width: 42px; white-space: nowrap; }
    .source { width: 55px; font-size: 9px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin-bottom: 7px; }
    .finding { margin-bottom: 9px; padding: 9px 11px; border-left: 3px solid #d97706; background: #fffaf0; list-style: none; break-inside: avoid; }
    .finding-high { border-color: #dc2626; background: #fff5f5; }
    .finding p { margin: 4px 0 0; }
    .finding span { margin-left: 6px; color: #666; font-size: 9px; text-transform: uppercase; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    footer { margin-top: 26px; padding-top: 9px; border-top: 1px solid #ddd; color: #777; font-size: 9px; }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <p class="eyebrow">Visibel</p>
      <h1>${escapeHtml(input.brandName)}</h1>
      <p class="muted">${escapeHtml(input.city || "Location not provided")} - ${escapeHtml(report.execution_mode)} evidence report</p>
    </div>
    <div class="meta">Audit ${escapeHtml(input.auditId)}<br>${escapeHtml(created)}</div>
  </header>

  <div class="score-band">
    <div class="score-card primary"><div class="score">${report.overall_score}</div><div class="score-label">Overall - ${escapeHtml(report.band)}</div></div>
    <div class="score-card"><div class="score">${report.text.score}</div><div class="score-label">Text score</div></div>
    <div class="score-card"><div class="score">${report.images.score}</div><div class="score-label">Image score</div></div>
  </div>

  <section class="summary"><h2>Executive summary</h2><p>${escapeHtml(report.executive_summary)}</p></section>

  ${report.memory_note ? `<section><h2>Compared with similar businesses</h2><p>${escapeHtml(report.memory_note.text)}</p></section>` : ""}

  <section><h2>Text criteria</h2><table><thead><tr><th>Criterion</th><th>Score</th><th>Evidence</th><th>Source</th></tr></thead><tbody>${criterionRows(report.text.criteria)}</tbody></table></section>

  <section><h2>Priority findings</h2><ul class="findings">${findings}</ul></section>

  <section class="columns">
    <div><h2>Improvement channels</h2><ul>${channels}</ul></div>
    <div><h2>Findability</h2><p><strong>${escapeHtml(report.findability.status.replaceAll("_", " "))}</strong> via Tavily</p><p>${report.findability.results.length} result(s) recorded.</p></div>
  </section>

  ${disclaimers ? `<section><h2>Disclaimers</h2><ul>${disclaimers}</ul></section>` : ""}
  <footer>Generated from persisted audit evidence. Scores are computed by the deterministic rubric; model output does not set totals.</footer>
</body>
</html>`;
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(buildReportHtml(input), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
