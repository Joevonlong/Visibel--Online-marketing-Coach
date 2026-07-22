/**
 * F-092 — seed Cognee from 2–3 genuinely completed LIVE rehearsal audits.
 *
 * Usage:
 *   npx tsx scripts/seed-cognee.ts --audit <id-1> --audit <id-2> [--audit <id-3>]
 *
 * The script rejects REPLAY/draft/failed audits, requires all inputs to be
 * comparable (same trade and city), stores their real report summaries, and
 * performs a recall before reporting success. It never turns an authored
 * fixture or an unverifiable call into a success message.
 */
import { fileURLToPath } from "node:url";
import { getAudit, listChannels } from "../lib/db";
import {
  addAuditMemory,
  findSimilarAudits,
  type AuditMemorySummary,
  type SimilarAuditsResult,
} from "../lib/memory/cognee";
import { BusinessInput, Report } from "../lib/schemas";

type AddMemory = (summary: AuditMemorySummary) => Promise<boolean>;
type FindMemory = (trade: string, city?: string | null) => Promise<SimilarAuditsResult | null>;

export interface SeedCogneeDependencies {
  add: AddMemory;
  find: FindMemory;
}

export interface SeedCogneeResult {
  seeded: number;
  recall: SimilarAuditsResult;
}

const DEFAULT_DEPENDENCIES: SeedCogneeDependencies = {
  add: addAuditMemory,
  find: findSimilarAudits,
};

function comparableLocation(city: string | null | undefined): string {
  return (city ?? "").trim().toLowerCase();
}

function topFindingTitles(report: Report): string[] {
  return report.channels
    .filter((channel) => channel.id !== "optimized_site" && channel.id !== "promo_video")
    .slice(0, 3)
    .map((channel) => channel.title);
}

export async function seedCogneeAudits(
  auditIds: string[],
  dependencies: SeedCogneeDependencies = DEFAULT_DEPENDENCIES,
): Promise<SeedCogneeResult> {
  if (auditIds.length < 2 || auditIds.length > 3) {
    throw new Error(`F-092 requires exactly 2 or 3 audit ids; received ${auditIds.length}.`);
  }
  if (new Set(auditIds).size !== auditIds.length) {
    throw new Error("F-092 requires 2–3 distinct audit ids; duplicate ids are not real seed audits.");
  }

  const summaries = auditIds.map((auditId): AuditMemorySummary => {
    const audit = getAudit(auditId);
    if (!audit) throw new Error(`No audit found with id "${auditId}".`);
    if (audit.execution_mode !== "LIVE") {
      throw new Error(`Audit "${auditId}" must be LIVE; REPLAY content cannot seed truthful Cognee memory.`);
    }
    if (audit.status !== "scored" && audit.status !== "complete") {
      throw new Error(`Audit "${auditId}" has status "${audit.status}"; it must be scored or complete.`);
    }

    const business = BusinessInput.parse(audit.business_json);
    const report = Report.parse(audit.report_json);
    if (report.execution_mode !== "LIVE") {
      throw new Error(`Audit "${auditId}" has a non-LIVE report and cannot seed truthful Cognee memory.`);
    }

    return {
      audit_id: auditId,
      brand_name: business.brand_name,
      trade: business.trade,
      city: business.city ?? null,
      overall_score: report.overall_score,
      text_score: report.text.score,
      image_score: report.images.score,
      top_finding_titles: topFindingTitles(report),
      weaknesses: report.channels
        .filter((channel) => channel.id !== "optimized_site" && channel.id !== "promo_video")
        .map((channel) => ({
          channel_id: channel.id,
          title: channel.title,
          lane: channel.lane,
          severity: channel.severity,
        })),
      improvements: listChannels(auditId)
        .filter((channel) => channel.status === "improved")
        .map((channel) => ({
          channel_id: channel.id,
          title: channel.title,
          result_summary: channel.one_liner || "Recorded improvement output",
        })),
    };
  });

  const first = summaries[0];
  const allComparable = summaries.every(
    (summary) =>
      summary.trade === first.trade && comparableLocation(summary.city) === comparableLocation(first.city),
  );
  if (!allComparable) {
    throw new Error("Seed audits must share the same trade and city so demo-time recall is genuinely similar.");
  }

  for (const summary of summaries) {
    const accepted = await dependencies.add(summary);
    if (!accepted) {
      throw new Error(
        `Cognee remember request for audit "${summary.audit_id}" was not accepted. Check the URL/key/dataset and retry; do not demo the memory line.`,
      );
    }
  }

  const recall = await dependencies.find(first.trade, first.city ?? null);
  if (!recall || recall.count < summaries.length) {
    throw new Error(
      `Cognee seed requests finished, but recall could not verify all ${summaries.length} stored audits. ` +
      "Check the URL/key/dataset and retry; do not demo the memory line.",
    );
  }

  return { seeded: summaries.length, recall };
}

function parseAuditIds(argv: string[]): string[] {
  const ids: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--audit" && argv[index + 1]) {
      ids.push(argv[index + 1]);
      index += 1;
    }
  }
  return ids;
}

const USAGE = "Usage: npx tsx scripts/seed-cognee.ts --audit <id-1> --audit <id-2> [--audit <id-3>]";

async function main(): Promise<void> {
  const auditIds = parseAuditIds(process.argv.slice(2));
  if (auditIds.length === 0) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await seedCogneeAudits(auditIds);
    console.log(
      `Cognee seed verified: ${result.seeded} LIVE audit(s) submitted; recall returned ${result.recall.count} similar audit(s), weakest lane "${result.recall.weakest_lane}".`,
    );
    if (result.recall.shared_weaknesses?.length) {
      console.log(`Shared weaknesses: ${result.recall.shared_weaknesses.join("; ")}`);
    }
    if (result.recall.successful_improvements?.length) {
      console.log(`Successful improvement channels: ${result.recall.successful_improvements.join("; ")}`);
    }
    if (result.recall.explanation) {
      console.log(`Cognee explanation: ${result.recall.explanation}`);
    }
  } catch (error) {
    console.error(`seed-cognee: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

function isDirectlyExecuted(): boolean {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
}

if (isDirectlyExecuted()) {
  void main();
}
