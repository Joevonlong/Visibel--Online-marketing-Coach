// SQLite persistence layer (F-005). Schema-agnostic: JSON columns are stored
// as TEXT and parsed back to `unknown` here. Frozen zod schemas that validate
// the *shape* of that JSON live separately in lib/schemas.ts — this module
// never imports from there, so persistence never coupled to the app-level
// contract.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Connection (lazy singleton)
// ---------------------------------------------------------------------------

let dbInstance: Database.Database | null = null;

function resolveDbPath(): string {
  const override = process.env.APP_DB_PATH;
  if (override && override.trim().length > 0) return override;
  return join(process.cwd(), "storage", "app.db");
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_mode TEXT NOT NULL,
      business_json TEXT NOT NULL,
      evidence_json TEXT,
      report_json TEXT,
      preview_json TEXT,
      overall_score INTEGER
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL REFERENCES audits(id),
      kind TEXT NOT NULL,
      source TEXT,
      storage_path TEXT,
      meta_json TEXT,
      score_json TEXT,
      label TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT NOT NULL,
      audit_id TEXT NOT NULL REFERENCES audits(id),
      lane TEXT NOT NULL,
      title TEXT NOT NULL,
      one_liner TEXT NOT NULL DEFAULT '',
      priority REAL NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      PRIMARY KEY (audit_id, id)
    );

    CREATE TABLE IF NOT EXISTS progress_events (
      audit_id TEXT NOT NULL,
      at TEXT NOT NULL,
      step TEXT NOT NULL,
      detail TEXT
    );
  `);
}

/**
 * Migration guard for a `storage/app.db` created before `one_liner` was
 * added to `channels` — CREATE TABLE IF NOT EXISTS is a no-op against an
 * existing table, so a pre-existing dev DB needs the column backfilled.
 */
function ensureChannelsOneLinerColumn(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(channels)`).all() as Array<{ name: string }>;
  const hasOneLiner = columns.some((column) => column.name === "one_liner");
  if (!hasOneLiner) {
    db.exec(`ALTER TABLE channels ADD COLUMN one_liner TEXT NOT NULL DEFAULT ''`);
  }
}

/** Lazy singleton connection. Creates storage/ and all tables on first use. */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  createTables(db);
  ensureChannelsOneLinerColumn(db);

  dbInstance = db;
  return dbInstance;
}

/** Closes the underlying connection and clears the singleton (tests only). */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ---------------------------------------------------------------------------
// JSON column helpers
// ---------------------------------------------------------------------------

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function toRequiredJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function fromJson(value: string | null | undefined): unknown | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// audits
// ---------------------------------------------------------------------------

export interface AuditRecord {
  id: string;
  created_at: string;
  status: string;
  execution_mode: string;
  business_json: unknown;
  evidence_json: unknown | null;
  report_json: unknown | null;
  preview_json: unknown | null;
  overall_score: number | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  status: string;
  execution_mode: string;
  business_json: string;
  evidence_json: string | null;
  report_json: string | null;
  preview_json: string | null;
  overall_score: number | null;
}

function mapAuditRow(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    created_at: row.created_at,
    status: row.status,
    execution_mode: row.execution_mode,
    business_json: fromJson(row.business_json),
    evidence_json: fromJson(row.evidence_json),
    report_json: fromJson(row.report_json),
    preview_json: fromJson(row.preview_json),
    overall_score: row.overall_score,
  };
}

export interface CreateAuditInput {
  business_json: unknown;
  /** Defaults to "draft". */
  status?: string;
  /** Defaults to "LIVE". */
  execution_mode?: string;
}

export function createAudit(input: CreateAuditInput): AuditRecord {
  const db = getDb();
  const id = randomUUID();
  const created_at = new Date().toISOString();
  const status = input.status ?? "draft";
  const execution_mode = input.execution_mode ?? "LIVE";

  db.prepare(
    `INSERT INTO audits (id, created_at, status, execution_mode, business_json, evidence_json, report_json, preview_json, overall_score)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`
  ).run(id, created_at, status, execution_mode, toRequiredJson(input.business_json));

  return getAudit(id)!;
}

export function getAudit(id: string): AuditRecord | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM audits WHERE id = ?`).get(id) as AuditRow | undefined;
  return row ? mapAuditRow(row) : undefined;
}

export function listAudits(): AuditRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM audits ORDER BY created_at DESC, rowid DESC`)
    .all() as AuditRow[];
  return rows.map(mapAuditRow);
}

export interface UpdateAuditPatch {
  status?: string;
  execution_mode?: string;
  evidence_json?: unknown;
  report_json?: unknown;
  preview_json?: unknown;
  overall_score?: number | null;
}

/** Partial update. Only fields present in `patch` are written. */
export function updateAudit(id: string, patch: UpdateAuditPatch): AuditRecord | undefined {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.execution_mode !== undefined) {
    sets.push("execution_mode = ?");
    values.push(patch.execution_mode);
  }
  if (patch.evidence_json !== undefined) {
    sets.push("evidence_json = ?");
    values.push(toJson(patch.evidence_json));
  }
  if (patch.report_json !== undefined) {
    sets.push("report_json = ?");
    values.push(toJson(patch.report_json));
  }
  if (patch.preview_json !== undefined) {
    sets.push("preview_json = ?");
    values.push(toJson(patch.preview_json));
  }
  if (patch.overall_score !== undefined) {
    sets.push("overall_score = ?");
    values.push(patch.overall_score);
  }

  if (sets.length === 0) return getAudit(id);

  values.push(id);
  db.prepare(`UPDATE audits SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getAudit(id);
}

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

export interface AssetRecord {
  id: string;
  audit_id: string;
  kind: string;
  source: string | null;
  storage_path: string | null;
  meta_json: unknown | null;
  score_json: unknown | null;
  label: string | null; // NULL | 'ai_concept' | 'enhanced'
  status: string;
}

interface AssetRow {
  id: string;
  audit_id: string;
  kind: string;
  source: string | null;
  storage_path: string | null;
  meta_json: string | null;
  score_json: string | null;
  label: string | null;
  status: string;
}

function mapAssetRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    audit_id: row.audit_id,
    kind: row.kind,
    source: row.source,
    storage_path: row.storage_path,
    meta_json: fromJson(row.meta_json),
    score_json: fromJson(row.score_json),
    label: row.label,
    status: row.status,
  };
}

export interface InsertAssetInput {
  audit_id: string;
  kind: string;
  source?: string | null;
  storage_path?: string | null;
  meta_json?: unknown;
  score_json?: unknown;
  label?: string | null;
  /** Defaults to "pending". */
  status?: string;
}

export function insertAsset(input: InsertAssetInput): AssetRecord {
  const db = getDb();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO assets (id, audit_id, kind, source, storage_path, meta_json, score_json, label, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.audit_id,
    input.kind,
    input.source ?? null,
    input.storage_path ?? null,
    toJson(input.meta_json),
    toJson(input.score_json),
    input.label ?? null,
    input.status ?? "pending"
  );

  return getAsset(id)!;
}

export function getAsset(id: string): AssetRecord | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM assets WHERE id = ?`).get(id) as AssetRow | undefined;
  return row ? mapAssetRow(row) : undefined;
}

/** Ordered by insertion order. */
export function listAssets(auditId: string): AssetRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM assets WHERE audit_id = ? ORDER BY rowid ASC`)
    .all(auditId) as AssetRow[];
  return rows.map(mapAssetRow);
}

export interface UpdateAssetPatch {
  kind?: string;
  source?: string | null;
  storage_path?: string | null;
  meta_json?: unknown;
  score_json?: unknown;
  label?: string | null;
  status?: string;
}

export function updateAsset(id: string, patch: UpdateAssetPatch): AssetRecord | undefined {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.kind !== undefined) {
    sets.push("kind = ?");
    values.push(patch.kind);
  }
  if (patch.source !== undefined) {
    sets.push("source = ?");
    values.push(patch.source);
  }
  if (patch.storage_path !== undefined) {
    sets.push("storage_path = ?");
    values.push(patch.storage_path);
  }
  if (patch.meta_json !== undefined) {
    sets.push("meta_json = ?");
    values.push(toJson(patch.meta_json));
  }
  if (patch.score_json !== undefined) {
    sets.push("score_json = ?");
    values.push(toJson(patch.score_json));
  }
  if (patch.label !== undefined) {
    sets.push("label = ?");
    values.push(patch.label);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }

  if (sets.length === 0) return getAsset(id);

  values.push(id);
  db.prepare(`UPDATE assets SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getAsset(id);
}

// ---------------------------------------------------------------------------
// channels
// ---------------------------------------------------------------------------

export interface ChannelRecord {
  id: string;
  audit_id: string;
  lane: string;
  title: string;
  one_liner: string;
  priority: number;
  severity: string;
  status: string;
  findings_json: unknown;
  before_json: unknown | null;
  after_json: unknown | null;
}

interface ChannelRow {
  id: string;
  audit_id: string;
  lane: string;
  title: string;
  one_liner: string;
  priority: number;
  severity: string;
  status: string;
  findings_json: string;
  before_json: string | null;
  after_json: string | null;
}

function mapChannelRow(row: ChannelRow): ChannelRecord {
  return {
    id: row.id,
    audit_id: row.audit_id,
    lane: row.lane,
    title: row.title,
    one_liner: row.one_liner,
    priority: row.priority,
    severity: row.severity,
    status: row.status,
    findings_json: fromJson(row.findings_json) ?? [],
    before_json: fromJson(row.before_json),
    after_json: fromJson(row.after_json),
  };
}

export interface ChannelInput {
  id: string;
  lane: string;
  title: string;
  /** Defaults to '' when omitted. */
  one_liner?: string;
  priority: number;
  severity: string;
  status: string;
  findings_json: unknown;
  before_json?: unknown;
  after_json?: unknown;
}

/**
 * Replaces the full channel set for an audit in one transaction (delete +
 * re-insert). Callers pass rows already in the desired display order —
 * listChannels() returns them back in that same (insertion) order.
 */
export function replaceChannels(auditId: string, rows: ChannelInput[]): ChannelRecord[] {
  const db = getDb();
  const deleteStmt = db.prepare(`DELETE FROM channels WHERE audit_id = ?`);
  const insertStmt = db.prepare(
    `INSERT INTO channels (id, audit_id, lane, title, one_liner, priority, severity, status, findings_json, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction((items: ChannelInput[]) => {
    deleteStmt.run(auditId);
    for (const item of items) {
      insertStmt.run(
        item.id,
        auditId,
        item.lane,
        item.title,
        item.one_liner ?? "",
        item.priority,
        item.severity,
        item.status,
        toRequiredJson(item.findings_json ?? []),
        toJson(item.before_json),
        toJson(item.after_json)
      );
    }
  });
  tx(rows);

  return listChannels(auditId);
}

/** Ordered by insertion order (the order replaceChannels() was given). */
export function listChannels(auditId: string): ChannelRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM channels WHERE audit_id = ? ORDER BY rowid ASC`)
    .all(auditId) as ChannelRow[];
  return rows.map(mapChannelRow);
}

export function updateChannelStatus(
  auditId: string,
  channelId: string,
  status: string,
  afterJson?: unknown
): ChannelRecord | undefined {
  const db = getDb();

  if (afterJson !== undefined) {
    db.prepare(`UPDATE channels SET status = ?, after_json = ? WHERE audit_id = ? AND id = ?`).run(
      status,
      toJson(afterJson),
      auditId,
      channelId
    );
  } else {
    db.prepare(`UPDATE channels SET status = ? WHERE audit_id = ? AND id = ?`).run(
      status,
      auditId,
      channelId
    );
  }

  const row = db
    .prepare(`SELECT * FROM channels WHERE audit_id = ? AND id = ?`)
    .get(auditId, channelId) as ChannelRow | undefined;
  return row ? mapChannelRow(row) : undefined;
}

// ---------------------------------------------------------------------------
// progress_events
// ---------------------------------------------------------------------------

export interface ProgressEventRecord {
  audit_id: string;
  at: string;
  step: string;
  detail: string | null;
}

export function addProgressEvent(auditId: string, step: string, detail?: string): ProgressEventRecord {
  const db = getDb();
  const at = new Date().toISOString();

  db.prepare(`INSERT INTO progress_events (audit_id, at, step, detail) VALUES (?, ?, ?, ?)`).run(
    auditId,
    at,
    step,
    detail ?? null
  );

  return { audit_id: auditId, at, step, detail: detail ?? null };
}

/** Ordered by insertion order (chronological even when timestamps tie). */
export function listProgressEvents(auditId: string): ProgressEventRecord[] {
  const db = getDb();
  return db
    .prepare(`SELECT audit_id, at, step, detail FROM progress_events WHERE audit_id = ? ORDER BY rowid ASC`)
    .all(auditId) as ProgressEventRecord[];
}
