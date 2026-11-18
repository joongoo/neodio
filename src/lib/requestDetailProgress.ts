import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";

export interface RequestDetailSnapshot { request: RequestLogRow; items: RequestItemPage }
export const REQUEST_DETAIL_POLL_MS = 5_000;
export interface RequestRefreshState {
  phase: "waiting" | "refreshing" | "paused" | "stopped";
  secondsUntilRefresh: number | null;
  nextRefreshAt: number | null;
  lastUpdatedAt: number | null;
}
export function hasActiveRequestTasks(request: RequestLogRow) {
  // Mixed requests may be needs_attention while other items are still running.
  return request.counts.waiting + request.counts.running > 0;
}

/** Read-only scheduler. Hidden/disposed responses cannot update the screen. */
export function createRequestDetailPoller<T>({ read, onData, onError, isActive, initiallyActive, initiallyVisible, isFatal = () => false,
  schedule = (fn, ms) => setTimeout(fn, ms), unschedule = timer => clearTimeout(timer),
  onStateChange, now = () => Date.now(),
}: {
  read: (signal: AbortSignal) => Promise<T>; onData: (data: T) => void; onError: (error: unknown) => void;
  isActive: (data: T) => boolean; initiallyActive: boolean; initiallyVisible: boolean; isFatal?: (error: unknown) => boolean;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
  onStateChange?: (state: RequestRefreshState) => void; now?: () => number;
}) {
  let active = initiallyActive, visible = initiallyVisible, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let countdown: ReturnType<typeof setTimeout> | undefined;
  let lastUpdatedAt: number | null = null;
  function notify(phase: RequestRefreshState["phase"], nextRefreshAt: number | null = null) {
    if (!disposed) onStateChange?.({ phase, nextRefreshAt, lastUpdatedAt, secondsUntilRefresh: nextRefreshAt === null ? null : Math.max(0, Math.ceil((nextRefreshAt - now()) / 1000)) });
  }
  function clearTimer() {
    if (timer !== undefined) unschedule(timer); timer = undefined;
    if (countdown !== undefined) unschedule(countdown); countdown = undefined;
  }
  function next() {
    clearTimer();
    if (disposed) return;
    if (!active) { notify("stopped"); return; }
    if (!visible) { notify("paused"); return; }
    const nextAt = now() + REQUEST_DETAIL_POLL_MS;
    notify("waiting", nextAt);
    if (onStateChange) {
      const tick = () => { countdown = undefined; if (disposed || !active || !visible) return; notify("waiting", nextAt); if (now() < nextAt) countdown = schedule(tick, 1000); };
      countdown = schedule(tick, 1000);
    }
    timer = schedule(() => { clearTimer(); void poll(); }, REQUEST_DETAIL_POLL_MS);
  }
  async function poll() {
    if (disposed || !active || !visible || controller) return;
    const current = new AbortController(); controller = current;
    notify("refreshing");
    const timeout = schedule(() => current.abort(), 15_000);
    try {
      const data = await read(current.signal);
      if (!disposed && visible && controller === current && !current.signal.aborted) {
        active = isActive(data); lastUpdatedAt = now(); onData(data);
      }
    } catch (error) {
      if (!disposed && visible && controller === current) { if (isFatal(error)) active = false; onError(error); }
    } finally {
      unschedule(timeout);
      if (controller === current) { controller = undefined; next(); }
    }
  }
  next();
  return {
    setVisible(value: boolean) {
      if (disposed || visible === value) return;
      visible = value; clearTimer();
      if (!visible) { controller?.abort(); controller = undefined; notify(active ? "paused" : "stopped"); }
      else if (active) void poll();
      else notify("stopped");
    },
    dispose() { disposed = true; clearTimer(); controller?.abort(); controller = undefined; },
  };
}
