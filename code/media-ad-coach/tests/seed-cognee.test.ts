import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "../lib/fixtures/replay-audit.json";
import { seedCogneeAudits } from "../scripts/seed-cognee";

describe("seed-cognee — real rehearsal audit seeding", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "visibel-seed-cognee-test-"));
    process.env.APP_DB_PATH = join(tmpDir, "app.db");
    const db = await import("../lib/db");
    db.closeDb();
  });

  afterEach(async () => {
    const db = await import("../lib/db");
    db.closeDb();
    delete process.env.APP_DB_PATH;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function createCompletedLiveAudit(brandName: string): Promise<string> {
    const db = await import("../lib/db");
    const business = { ...fixture.business, brand_name: brandName };
    const audit = db.createAudit({ business_json: business, execution_mode: "LIVE" });
    db.updateAudit(audit.id, {
      status: "scored",
      overall_score: fixture.report.overall_score,
      report_json: { ...fixture.report, execution_mode: "LIVE", memory_note: null },
    });
    db.replaceChannels(
      audit.id,
      fixture.report.channels.map((channel) => ({
        id: channel.id,
        lane: channel.lane,
        title: channel.title,
        one_liner: channel.one_liner,
        priority: channel.priority,
        severity: channel.severity,
        status: channel.after === null ? channel.status : "improved",
        findings_json: channel.finding_ids,
        before_json: channel.before,
        after_json: channel.after,
      })),
    );
    return audit.id;
  }

  it("stores exactly 2–3 completed LIVE audits, then verifies a real recall", async () => {
    const ids = [await createCompletedLiveAudit("Krause One"), await createCompletedLiveAudit("Krause Two")];
    const add = vi.fn().mockResolvedValue(true);
    const find = vi.fn().mockResolvedValue({ count: 2, weakest_lane: "text" });

    const result = await seedCogneeAudits(ids, { add, find });

    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(1, expect.objectContaining({
      brand_name: "Krause One",
      trade: "plumber",
      city: "Berlin",
      overall_score: fixture.report.overall_score,
      top_finding_titles: expect.any(Array),
      weaknesses: expect.arrayContaining([
        expect.objectContaining({ channel_id: "hero_headline", lane: "text" }),
      ]),
      improvements: expect.arrayContaining([
        expect.objectContaining({ channel_id: "hero_headline" }),
      ]),
    }));
    expect(find).toHaveBeenCalledWith("plumber", "Berlin");
    expect(result).toEqual({ seeded: 2, recall: { count: 2, weakest_lane: "text" } });
  });

  it("rejects a REPLAY audit so authored fixture content can never be presented as real memory", async () => {
    const db = await import("../lib/db");
    const first = db.createAudit({ business_json: fixture.business, execution_mode: "REPLAY" });
    const second = db.createAudit({ business_json: fixture.business, execution_mode: "REPLAY" });
    db.updateAudit(first.id, {
      status: "scored",
      report_json: fixture.report,
      overall_score: fixture.report.overall_score,
    });
    db.updateAudit(second.id, {
      status: "scored",
      report_json: fixture.report,
      overall_score: fixture.report.overall_score,
    });

    await expect(seedCogneeAudits([first.id, second.id], {
      add: vi.fn(),
      find: vi.fn(),
    })).rejects.toThrow(/must be LIVE/);
  });

  it("fails honestly when Cognee does not return a verified recall", async () => {
    const ids = [await createCompletedLiveAudit("Krause One"), await createCompletedLiveAudit("Krause Two")];

    await expect(seedCogneeAudits(ids, {
      add: vi.fn().mockResolvedValue(true),
      find: vi.fn().mockResolvedValue(null),
    })).rejects.toThrow(/could not verify/i);
  });

  it("fails honestly when any Cognee remember request is rejected", async () => {
    const ids = [await createCompletedLiveAudit("Krause One"), await createCompletedLiveAudit("Krause Two")];
    const add = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(seedCogneeAudits(ids, {
      add,
      find: vi.fn(),
    })).rejects.toThrow(/was not accepted/i);
  });
});
