import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "media-ad-events-"));
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

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 800;
  while (!text.includes(needle) && Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${needle}`)), 800)),
    ]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  return text;
}

describe("audit progress SSE", () => {
  it("keeps one stream across scored and improve progress, then closes when the audit is complete", async () => {
    const db = await import("../lib/db");
    const { createAuditEventStream } = await import("../app/api/audits/[id]/events/stream");
    const audit = db.createAudit({ business_json: {}, status: "analyzing", execution_mode: "LIVE" });
    db.addProgressEvent(audit.id, "reading_site", "Started");
    const reader = createAuditEventStream(audit.id, new AbortController().signal, { pollIntervalMs: 5, heartbeatIntervalMs: 1_000 }).getReader();
    expect(await readUntil(reader, "event: snapshot")).toContain("reading_site");

    db.addProgressEvent(audit.id, "collecting_images", "Found 3");
    expect(await readUntil(reader, "collecting_images")).toContain("event: progress");
    db.updateAudit(audit.id, { status: "scored" });
    db.addProgressEvent(audit.id, "rewriting_copy", "Improving copy");
    expect(await readUntil(reader, "rewriting_copy")).toContain("event: progress");
    db.updateAudit(audit.id, { status: "complete" });
    expect(await readUntil(reader, "event: complete")).toContain('"status":"complete"');
    expect((await reader.read()).done).toBe(true);
  });

  it("emits heartbeats and cleans up when the request aborts", async () => {
    const db = await import("../lib/db");
    const { createAuditEventStream } = await import("../app/api/audits/[id]/events/stream");
    const audit = db.createAudit({ business_json: {}, status: "analyzing" });
    const abort = new AbortController();
    const reader = createAuditEventStream(audit.id, abort.signal, { pollIntervalMs: 1_000, heartbeatIntervalMs: 5 }).getReader();
    await readUntil(reader, "event: snapshot");
    expect(await readUntil(reader, ": heartbeat")).toContain(": heartbeat");
    abort.abort();
    expect((await reader.read()).done).toBe(true);
  });

  it("GET returns 404 for an unknown audit and SSE headers for a real one", async () => {
    const db = await import("../lib/db");
    const { GET } = await import("../app/api/audits/[id]/events/route");
    const missing = await GET(new Request("http://test/events"), { params: Promise.resolve({ id: "missing" }) });
    expect(missing.status).toBe(404);
    const audit = db.createAudit({ business_json: {}, status: "failed" });
    const response = await GET(new Request("http://test/events"), { params: Promise.resolve({ id: audit.id }) });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("event: error");
  });
});
