// F-065/F-097: live audit updates. EventSource is the primary transport;
// bounded 1s/5s polling remains only as a compatibility fallback when SSE is
// unavailable or the connection is interrupted.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AuditPollResponse } from "./types";

const FALLBACK_ACTIVE_INTERVAL_MS = 1000;
// ISS-032: images arrive over tens of seconds, long after the audit reports
// "complete". Watching for them does not need second-by-second granularity —
// a relaxed cadence keeps the page live without hammering the endpoint.
const IMAGES_PENDING_INTERVAL_MS = 3000;
const FALLBACK_IDLE_INTERVAL_MS = 5000;

const ACTIVE_STATUSES = new Set(["draft", "analyzing", "improving"]);

/** FEA-112 / ISS-032: images keep generating AFTER the audit is "complete",
 *  so completion alone must never stop the updates. */
export function imagesPending(data: AuditPollResponse | null): boolean {
  return (data?.images_pending ?? 0) > 0;
}

function isActive(data: AuditPollResponse | null): boolean {
  if (!data) return true; // no data yet — keep polling fast until we learn otherwise
  if (ACTIVE_STATUSES.has(data.status)) return true;
  if (data.channels?.some((channel) => channel.status === "improving")) return true;
  return imagesPending(data);
}

/** Delay before the next fallback tick. Exported for the unit test — the whole
 *  point of ISS-032 is that a "complete" audit with images in flight keeps a
 *  live cadence instead of falling back to the idle one (or stopping). */
export function nextPollDelayMs(data: AuditPollResponse | null): number {
  if (!isActive(data)) return FALLBACK_IDLE_INTERVAL_MS;
  // Only images left in flight -> relaxed cadence; a genuinely running
  // pipeline still updates every second.
  if (data && !ACTIVE_STATUSES.has(data.status) && imagesPending(data)) {
    return IMAGES_PENDING_INTERVAL_MS;
  }
  return FALLBACK_ACTIVE_INTERVAL_MS;
}

export type UseAuditPollResult = {
  data: AuditPollResponse | null;
  error: string | null;
  refetch: () => void;
};

/** Streams audit lifecycle notifications and refreshes the canonical JSON
 * response after each event. Falls back to the original 1s/5s polling
 * cadence if EventSource is unavailable or disconnects. */
export function useAuditPoll(auditId: string, initial?: AuditPollResponse): UseAuditPollResult {
  const [data, setData] = useState<AuditPollResponse | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const fetchOnce = useCallback(async () => {
    try {
      const response = await fetch(`/api/audits/${auditId}`, { cache: "no-store" });
      if (!response.ok) {
        setError(`Failed to load audit (${response.status}).`);
        return;
      }
      const json = (await response.json()) as AuditPollResponse;
      setData(json);
      setError(null);
    } catch {
      setError("Network error while polling this audit.");
    }
  }, [auditId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;

    const tick = async () => {
      if (cancelled) return;
      await fetchOnce();
      if (cancelled) return;
      timer = setTimeout(tick, nextPollDelayMs(dataRef.current));
    };

    const startFallback = () => {
      if (cancelled || timer) return;
      void tick();
    };

    if (typeof EventSource === "undefined") {
      startFallback();
    } else {
      source = new EventSource(`/api/audits/${auditId}/events`);
      const refresh = () => {
        void fetchOnce();
      };
      source.addEventListener("snapshot", refresh);
      source.addEventListener("progress", refresh);
      source.addEventListener("complete", () => {
        // ISS-032: the server closes this stream when the AUDIT reaches a
        // terminal status, but image generation outlives it (FEA-112). Re-read
        // the canonical payload and, if images are still in flight, hand over
        // to the fallback poller instead of going silent — otherwise the
        // finished images only appear after a manual page refresh.
        void fetchOnce().then(() => {
          if (cancelled) return;
          if (imagesPending(dataRef.current)) startFallback();
        });
        source?.close();
        source = null;
      });
      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        source = null;
        setError("Live progress connection interrupted; using fallback updates.");
        startFallback();
      };
    }

    return () => {
      cancelled = true;
      source?.close();
      if (timer) clearTimeout(timer);
    };
  }, [auditId, fetchOnce]);

  const refetch = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { data, error, refetch };
}
