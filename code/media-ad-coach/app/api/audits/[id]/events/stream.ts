import { getAudit, listProgressEvents } from "../../../../../lib/db";

const encoder = new TextEncoder();
// `scored` is intentionally not terminal: the same report-page connection
// stays open while the user starts an Improve It / Do It For You run.
const TERMINAL = new Set(["complete", "failed"]);

export interface StreamOptions {
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
}

function encodeEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createAuditEventStream(
  auditId: string,
  signal: AbortSignal,
  options: StreamOptions = {},
): ReadableStream<Uint8Array> {
  let dispose: () => void = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      let cursor = 0;
      let polling = false;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
      const pollIntervalMs = options.pollIntervalMs ?? 250;
      const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;

      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        signal.removeEventListener("abort", onAbort);
      };
      const finish = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        controller.close();
      };
      const fail = () => {
        if (stopped) return;
        controller.enqueue(encodeEvent("error", { status: "failed", detail: "Progress stream failed." }));
        finish();
      };
      const terminalEvent = (status: string) => {
        controller.enqueue(encodeEvent(status === "failed" ? "error" : "complete", { status }));
        finish();
      };
      const poll = () => {
        if (stopped || polling) return;
        polling = true;
        try {
          const progress = listProgressEvents(auditId);
          while (cursor < progress.length) {
            controller.enqueue(encodeEvent("progress", progress[cursor++]));
          }
          const audit = getAudit(auditId);
          if (!audit) return fail();
          if (TERMINAL.has(audit.status)) terminalEvent(audit.status);
        } catch {
          fail();
        } finally {
          polling = false;
        }
      };
      const onAbort = () => finish();
      const initialAudit = getAudit(auditId);
      const initialProgress = listProgressEvents(auditId);
      cursor = initialProgress.length;
      controller.enqueue(encodeEvent("snapshot", {
        status: initialAudit?.status ?? "failed",
        execution_mode: initialAudit?.execution_mode ?? "HANDOFF_REQUIRED",
        progress: initialProgress,
      }));

      pollTimer = setInterval(poll, pollIntervalMs);
      heartbeatTimer = setInterval(() => {
        if (!stopped) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, heartbeatIntervalMs);
      signal.addEventListener("abort", onAbort, { once: true });
      dispose = cleanup;
      if (!initialAudit || TERMINAL.has(initialAudit.status)) terminalEvent(initialAudit?.status ?? "failed");
    },
    cancel() {
      dispose();
    },
  });
}
