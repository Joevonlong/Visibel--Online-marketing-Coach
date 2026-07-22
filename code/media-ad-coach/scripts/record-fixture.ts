/**
 * F-082 — one-command re-record of lib/fixtures/replay-audit.json from a
 * real completed audit already sitting in storage/app.db.
 *
 * Usage:
 *   npx tsx scripts/record-fixture.ts --audit <auditId> [--out <path>] [--slug <slug>]
 *
 * Run a full LIVE audit through POST /api/audits -> analyze -> (ideally)
 * "Do It For You" first, note its id, then point this script at it. It reads
 * that one audit's row, its `channels` table (the source of truth for real
 * `after` content — report_json is only the analyze-time snapshot), and its
 * `assets` table; copies every normalized/generated image with a real file
 * on disk into public/fixtures/<slug>/; and writes a fresh FixtureAudit-
 * shaped JSON. Zero network calls, zero API keys needed — this only reads
 * what a LIVE run already produced locally.
 *
 * The committed fixture is produced by this command from a completed LIVE
 * audit. The integration test also exercises the same copy/serialization
 * path against an isolated database so later re-records stay safe.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAudit, listAssets, listChannels, type AssetRecord } from "../lib/db";
import { FixtureAudit, type Asset, type BusinessInput, type Report } from "../lib/schemas";

// ---------------------------------------------------------------------------
// Slug (public/fixtures/<slug>/ folder name)
// ---------------------------------------------------------------------------

const UMLAUT_MAP: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };

export function slugify(input: string): string {
  const transliterated = input.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
  return transliterated
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip remaining combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Storage root (same APP_STORAGE_DIR convention as the rest of the codebase)
// ---------------------------------------------------------------------------

function resolveStorageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return join(process.cwd(), "storage");
}

/** Asset `storage_path` is normally already absolute (lib/pipeline/images.ts
 *  and lib/improve/image.ts join it against the storage root at write time)
 *  — this only defends against a relative literal slipping through, the
 *  same defensive pattern lib/pipeline/orchestrator.ts's
 *  resolveRawUploadPath uses for raw uploads. */
function resolveAssetFile(storagePath: string): string {
  if (existsSync(storagePath)) return storagePath;
  return join(resolveStorageRoot(), storagePath);
}

// ---------------------------------------------------------------------------
// Image copy — normalized/generated assets only (plan F-082 scope: "a real
// completed audit ... including ... pre-generated images"). Raw/pending
// uploads and consumed GBP screenshots are intentionally not carried over.
// ---------------------------------------------------------------------------

const COPYABLE_KINDS = new Set(["harvested_image", "uploaded_image", "generated_image"]);

interface CopiedAsset {
  asset: AssetRecord;
  publicPath: string; // "/fixtures/<slug>/<file>" — what the fixture JSON stores
}

function destFileName(asset: AssetRecord, realPhotoIndex: number): string {
  const ext = asset.storage_path ? extname(asset.storage_path) || ".jpg" : ".jpg";
  if (asset.kind === "generated_image") {
    const meta = asset.meta_json as { channel?: string } | null;
    const label = meta?.channel ? meta.channel.replace(/_/g, "-") : `concept-${realPhotoIndex}`;
    return `after-${label}${ext}`;
  }
  return `before-${realPhotoIndex}${ext}`;
}

function uniqueDestFileName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  const ext = extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  let suffix = 2;
  let candidate = `${stem}-${suffix}${ext}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${stem}-${suffix}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function copyImageAssets(assets: AssetRecord[], slug: string, publicDir: string): CopiedAsset[] {
  const targetDir = join(publicDir, "fixtures", slug);
  mkdirSync(targetDir, { recursive: true });

  const copyable = assets.filter((a) => COPYABLE_KINDS.has(a.kind) && a.storage_path);
  const copied: CopiedAsset[] = [];
  let realPhotoIndex = 0;
  const usedNames = new Set<string>();

  for (const asset of copyable) {
    const sourcePath = resolveAssetFile(asset.storage_path as string);
    if (!existsSync(sourcePath)) {
      console.warn(`record-fixture: skipping asset ${asset.id} — no file found on disk at ${sourcePath}`);
      continue;
    }
    if (asset.kind !== "generated_image") realPhotoIndex += 1;
    const fileName = uniqueDestFileName(destFileName(asset, realPhotoIndex), usedNames);
    copyFileSync(sourcePath, join(targetDir, fileName));
    copied.push({ asset, publicPath: `/fixtures/${slug}/${fileName}` });
  }

  return copied;
}

// ---------------------------------------------------------------------------
// Core (exported so tests can drive it without going through argv/process.exit)
// ---------------------------------------------------------------------------

export interface RecordFixtureOptions {
  outPath?: string;
  publicDir?: string;
  slug?: string;
}

export interface RecordFixtureResult {
  outPath: string;
  slug: string;
  channelsWithAfter: number;
  assetsCopied: number;
}

export async function recordFixture(auditId: string, opts: RecordFixtureOptions = {}): Promise<RecordFixtureResult> {
  const audit = getAudit(auditId);
  if (!audit) {
    throw new Error(`No audit found with id "${auditId}". Run POST /api/audits (then analyze) first.`);
  }
  if (audit.execution_mode !== "LIVE") {
    throw new Error(
      `Audit "${auditId}" uses execution mode "${audit.execution_mode}" — record-fixture only accepts a real LIVE audit.`
    );
  }
  if (audit.status !== "scored" && audit.status !== "complete") {
    throw new Error(
      `Audit "${auditId}" has status "${audit.status}" — record-fixture needs a fully analyzed audit ` +
        `(status "scored" or "complete"). Run POST /api/audits/:id/analyze first, then (ideally) "Do It For You".`
    );
  }
  if (!audit.report_json) {
    throw new Error(`Audit "${auditId}" has no report_json — analyze must complete before recording.`);
  }

  const business = audit.business_json as BusinessInput;
  const report = audit.report_json as Report;
  const slug = opts.slug ?? slugify(business.brand_name || auditId);
  const publicDir = opts.publicDir ?? join(process.cwd(), "public");
  const outPath = opts.outPath ?? join(process.cwd(), "lib", "fixtures", "replay-audit.json");

  const assetRecords = listAssets(auditId);
  const copied = copyImageAssets(assetRecords, slug, publicDir);

  const fixtureAssets: Asset[] = copied.map(({ asset, publicPath }) => ({
    id: asset.id,
    audit_id: `audit-replay-${slug}`,
    kind: asset.kind as Asset["kind"],
    source: asset.source,
    storage_path: publicPath,
    meta: (asset.meta_json as Record<string, unknown> | null) ?? null,
    score: asset.score_json as Asset["score"],
    label: asset.label as Asset["label"],
    status: asset.status,
  }));

  // report_json is the analyze-time snapshot (channels' `after` still null
  // there, `status` correctly "todo"/"coming_soon") — the `channels` table
  // is what "Do It For You" actually wrote `after` content to, so overlay
  // ONLY `after` from there. `status` deliberately stays report_json's
  // analyze-time value, never the live "improved" — REPLAY analyze loads
  // this fixture verbatim (lib/pipeline/orchestrator.ts's runReplayPipeline),
  // so a recorded "improved" status here would make every channel look
  // already-done right after analyze, before "Do It For You" ever runs.
  const liveChannelsById = new Map(listChannels(auditId).map((c) => [c.id, c]));
  const channels = report.channels.map((channel) => {
    const live = liveChannelsById.get(channel.id);
    return live ? { ...channel, after: live.after_json } : channel;
  });

  const replayDisclaimer =
    `REPLAY SAMPLE: recorded from completed LIVE audit ${audit.id} at ${audit.created_at}; ` +
    "replay makes no live partner calls.";
  const fixture: FixtureAudit = FixtureAudit.parse({
    business,
    report: {
      ...report,
      execution_mode: "REPLAY",
      memory_note: null,
      disclaimers: [...report.disclaimers, replayDisclaimer],
      channels,
    },
    assets: fixtureAssets,
    preview_json: audit.preview_json,
  });

  writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf-8");

  return {
    outPath,
    slug,
    channelsWithAfter: channels.filter((c) => c.after !== null).length,
    assetsCopied: copied.length,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface ParsedArgs {
  auditId?: string;
  outPath?: string;
  slug?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--audit") result.auditId = argv[++i];
    else if (argv[i] === "--out") result.outPath = argv[++i];
    else if (argv[i] === "--slug") result.slug = argv[++i];
  }
  return result;
}

const USAGE = `Usage: npx tsx scripts/record-fixture.ts --audit <auditId> [--out <path>] [--slug <slug>]

Records lib/fixtures/replay-audit.json (default) from a completed audit
already in storage/app.db (status "scored" or "complete"). Run a full LIVE
audit through analyze — and ideally "Do It For You" — first, then pass its
audit id here.

  --audit <id>   Required. The audit id to record from.
  --out <path>   Optional. Output fixture path (default: lib/fixtures/replay-audit.json).
  --slug <slug>  Optional. Image folder name under public/fixtures/ (default: derived from brand_name).
`;

async function main(): Promise<void> {
  const { auditId, outPath, slug } = parseArgs(process.argv.slice(2));
  if (!auditId) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await recordFixture(auditId, { outPath, slug });
    console.log(
      `record-fixture: wrote ${result.outPath} — slug "${result.slug}", ` +
        `${result.channelsWithAfter} channel(s) with a recorded after, ${result.assetsCopied} image(s) copied.`
    );
  } catch (error) {
    console.error(`record-fixture: ${error instanceof Error ? error.message : String(error)}`);
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
