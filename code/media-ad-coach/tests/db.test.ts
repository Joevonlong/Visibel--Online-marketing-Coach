import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-db-test-"));
  process.env.APP_DB_PATH = join(tmpDir, "app.db");
  // Fresh module graph per test so the lazy singleton in lib/db.ts re-reads
  // APP_DB_PATH instead of reusing a connection opened for a previous temp dir.
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
});

afterEach(async () => {
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
  delete process.env.APP_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("lib/db", () => {
  it("creates tables on first use and survives an empty query", async () => {
    const { getDb } = await import("../lib/db");
    const db = getDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["audits", "assets", "channels", "progress_events"]));
  });

  it("round-trips createAudit -> getAudit", async () => {
    const { createAudit, getAudit } = await import("../lib/db");
    const business = { brand_name: "Acme Plumbing", trade: "plumber", city: "Berlin" };
    const created = createAudit({ business_json: business, execution_mode: "LIVE" });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("draft");
    expect(created.execution_mode).toBe("LIVE");
    expect(created.business_json).toEqual(business);
    expect(created.evidence_json).toBeNull();
    expect(created.overall_score).toBeNull();

    const fetched = getAudit(created.id);
    expect(fetched).toEqual(created);
  });

  it("flips audit status via updateAudit (partial)", async () => {
    const { createAudit, updateAudit, getAudit } = await import("../lib/db");
    const created = createAudit({ business_json: { brand_name: "X", trade: "electrician" } });

    const updated = updateAudit(created.id, { status: "analyzing" });
    expect(updated?.status).toBe("analyzing");
    // untouched fields survive the partial update
    expect(updated?.business_json).toEqual(created.business_json);

    const scored = updateAudit(created.id, {
      status: "scored",
      overall_score: 72,
      report_json: { overall_score: 72, band: "Strong" },
    });
    expect(scored?.status).toBe("scored");
    expect(scored?.overall_score).toBe(72);
    expect(scored?.report_json).toEqual({ overall_score: 72, band: "Strong" });

    expect(getAudit(created.id)?.status).toBe("scored");
  });

  it("inserts and lists assets for an audit", async () => {
    const { createAudit, insertAsset, listAssets } = await import("../lib/db");
    const audit = createAudit({ business_json: { brand_name: "Acme", trade: "roofing" } });

    const a1 = insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      source: "https://example.com/hero.jpg",
      storage_path: "storage/images/a1.jpg",
      status: "scored",
      score_json: { I1: 4, I2: 3 },
    });
    const a2 = insertAsset({
      audit_id: audit.id,
      kind: "generated_image",
      status: "ready",
      label: "ai_concept",
    });

    expect(a1.label).toBeNull();
    expect(a2.label).toBe("ai_concept");

    const assets = listAssets(audit.id);
    expect(assets.map((a) => a.id)).toEqual([a1.id, a2.id]);
    expect(assets[0].score_json).toEqual({ I1: 4, I2: 3 });
  });

  it("updates an asset (label + status)", async () => {
    const { createAudit, insertAsset, updateAsset } = await import("../lib/db");
    const audit = createAudit({ business_json: { brand_name: "Acme", trade: "roofing" } });
    const asset = insertAsset({ audit_id: audit.id, kind: "uploaded_image", status: "pending" });

    const updated = updateAsset(asset.id, { status: "scored", label: "enhanced" });
    expect(updated?.status).toBe("scored");
    expect(updated?.label).toBe("enhanced");
  });

  it("replaces channels and flips channel status via updateChannelStatus", async () => {
    const { createAudit, replaceChannels, updateChannelStatus, listChannels } = await import("../lib/db");
    const audit = createAudit({ business_json: { brand_name: "Acme", trade: "plumber" } });

    const channels = replaceChannels(audit.id, [
      {
        id: "optimized_site",
        lane: "site",
        title: "Your optimized website",
        one_liner: "Your fully rebuilt page, ready to publish.",
        priority: 999,
        severity: "high",
        status: "todo",
        findings_json: [],
      },
      {
        id: "hero_headline",
        lane: "text",
        title: "Headline & first impression",
        one_liner: "Your headline doesn't say what you do or where.",
        priority: 10,
        severity: "high",
        status: "todo",
        findings_json: [{ id: "f1", lane: "text", criterion: "T1", severity: "high", evidence_quote: "..." }],
      },
      {
        id: "promo_video",
        lane: "video",
        title: "Promo video",
        // one_liner intentionally omitted — must default to ''
        priority: -1,
        severity: "low",
        status: "coming_soon",
        findings_json: [],
      },
    ]);

    expect(channels.map((c) => c.id)).toEqual(["optimized_site", "hero_headline", "promo_video"]);
    expect(channels.map((c) => c.one_liner)).toEqual([
      "Your fully rebuilt page, ready to publish.",
      "Your headline doesn't say what you do or where.",
      "",
    ]);

    const updated = updateChannelStatus(audit.id, "hero_headline", "improved", {
      channel_id: "hero_headline",
      before_excerpt: "Old headline",
      after: { headline: "New headline" },
      rationale_one_liner: "Clearer value prop",
    });
    expect(updated?.status).toBe("improved");
    // updateChannelStatus only touches status/after_json — one_liner must survive untouched
    expect(updated?.one_liner).toBe("Your headline doesn't say what you do or where.");
    expect(updated?.after_json).toEqual({
      channel_id: "hero_headline",
      before_excerpt: "Old headline",
      after: { headline: "New headline" },
      rationale_one_liner: "Clearer value prop",
    });

    const list = listChannels(audit.id);
    expect(list.find((c) => c.id === "hero_headline")?.status).toBe("improved");
    expect(list.find((c) => c.id === "optimized_site")?.status).toBe("todo");
  });

  it("replaceChannels fully replaces the previous set for that audit", async () => {
    const { createAudit, replaceChannels, listChannels } = await import("../lib/db");
    const audit = createAudit({ business_json: { brand_name: "Acme", trade: "plumber" } });

    replaceChannels(audit.id, [
      { id: "a", lane: "text", title: "A", priority: 1, severity: "low", status: "todo", findings_json: [] },
      { id: "b", lane: "text", title: "B", priority: 2, severity: "low", status: "todo", findings_json: [] },
    ]);
    replaceChannels(audit.id, [
      { id: "c", lane: "image", title: "C", priority: 3, severity: "low", status: "todo", findings_json: [] },
    ]);

    const list = listChannels(audit.id);
    expect(list.map((c) => c.id)).toEqual(["c"]);
  });

  it("adds and lists progress events in chronological order", async () => {
    const { createAudit, addProgressEvent, listProgressEvents } = await import("../lib/db");
    const audit = createAudit({ business_json: { brand_name: "Acme", trade: "plumber" } });

    addProgressEvent(audit.id, "reading_site");
    addProgressEvent(audit.id, "collecting_images", "harvested 6 images");
    addProgressEvent(audit.id, "checking_local_search");

    const events = listProgressEvents(audit.id);
    expect(events.map((e) => e.step)).toEqual(["reading_site", "collecting_images", "checking_local_search"]);
    expect(events[1].detail).toBe("harvested 6 images");
    expect(events[0].detail).toBeNull();
  });

  it("persists data across a close + reopen of the connection", async () => {
    const dbModule1 = await import("../lib/db");
    const audit = dbModule1.createAudit({
      business_json: { brand_name: "Persisted Co", trade: "doctor" },
      execution_mode: "REPLAY",
    });
    dbModule1.addProgressEvent(audit.id, "done");
    dbModule1.closeDb();

    // Re-import resolves to the same cached module (vitest caches by
    // specifier), but closeDb() cleared the singleton so getDb() below opens
    // a brand-new `new Database(...)` handle against the same file on disk.
    const dbModule2 = await import("../lib/db");
    const reloaded = dbModule2.getAudit(audit.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.business_json).toEqual({ brand_name: "Persisted Co", trade: "doctor" });
    expect(reloaded?.execution_mode).toBe("REPLAY");

    const events = dbModule2.listProgressEvents(audit.id);
    expect(events.map((e) => e.step)).toEqual(["done"]);
  });
});
