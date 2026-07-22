"use client";

// F-069..F-073 shared wiring: plain fetch helper for POST
// /api/audits/:id/improve (docs/CONTRACTS.md "Improve engine"). Never
// optimistically marks a channel improved — callers only use this to kick
// off the request and surface an honest error; the 1s poller (already wired
// in ReportView via useAuditPoll) is what flips channel/audit state once the
// engine actually finishes.
export type ImproveSelection = string[] | "all";

export type ImproveApiResult = { ok: true } | { ok: false; error: string };

/** Best-effort error message extraction — the route always returns
 *  `{error: string}` on non-2xx (400/404/409/501), but stays defensive
 *  against a body that fails to parse as JSON. */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const json: unknown = await response.json();
    if (json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string") {
      return (json as { error: string }).error;
    }
  } catch {
    // fall through to the generic message below
  }
  return `Request failed (${response.status}).`;
}

export async function postImprove(auditId: string, channels: ImproveSelection): Promise<ImproveApiResult> {
  try {
    const response = await fetch(`/api/audits/${auditId}/improve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels }),
    });
    if (response.status === 202) return { ok: true };
    return { ok: false, error: await extractErrorMessage(response) };
  } catch {
    return { ok: false, error: "Network error while starting the improvement." };
  }
}
