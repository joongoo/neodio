import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";

export interface RequestDetailSnapshot { request: RequestLogRow; items: RequestItemPage }
export const REQUEST_DETAIL_POLL_MS = 5_000;
export function hasActiveRequestTasks(request: RequestLogRow) {
  // Mixed requests may be needs_attention while other items are still running.
  return request.counts.waiting + request.counts.running > 0;
}

/** Read-only scheduler. Hidden/disposed responses cannot update the screen. */
export function createRequestDetailPoller<T>({ read, onData, onError, isActive, initiallyActive, initiallyVisible, isFatal = () => false,
  schedule = (fn, ms) => setTimeout(fn, ms), unschedule = timer => clearTimeout(timer),
}: {
  read: (signal: AbortSignal) => Promise<T>; onData: (data: T) => void; onError: (error: unknown) => void;
  isActive: (data: T) => boolean; initiallyActive: boolean; initiallyVisible: boolean; isFatal?: (error: unknown) => boolean;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let active = initiallyActive, visible = initiallyVisible, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  function clearTimer() { if (timer !== undefined) unschedule(timer); timer = undefined; }
  function next() {
    clearTimer();
    if (!disposed && active && visible) timer = schedule(() => { timer = undefined; void poll(); }, REQUEST_DETAIL_POLL_MS);
  }
  async function poll() {
    if (disposed || !active || !visible || controller) return;
    const current = new AbortController(); controller = current;
    const timeout = schedule(() => current.abort(), 15_000);
    try {
      const data = await read(current.signal);
      if (!disposed && visible && controller === current && !current.signal.aborted) {
        active = isActive(data); onData(data);
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
      if (!visible) { controller?.abort(); controller = undefined; }
      else void poll();
    },
    dispose() { disposed = true; clearTimer(); controller?.abort(); controller = undefined; },
  };
}
