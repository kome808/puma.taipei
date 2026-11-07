export class RequestDeadlineError extends Error {
  constructor() {
    super('Request deadline exceeded');
    this.name = 'RequestDeadlineError';
  }
}

type Timers = {
  schedule: (callback: () => void, milliseconds: number) => unknown;
  unschedule: (handle: unknown) => void;
};

// Reject on the deadline even when a browser request ignores cancellation.
// Use an ordinary AbortController for compatibility with mobile browsers.
export function withRequestDeadline<T>(
  task: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  timeoutMs: number,
  timers: Timers = {
    schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
    unschedule: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): Promise<T> {
  if (parent.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: unknown;
    const settle = (outcome: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      timers.unschedule(timer);
      parent.removeEventListener('abort', abort);
      if ('error' in outcome) reject(outcome.error);
      else resolve(outcome.value);
    };
    const abort = () => {
      settle({ error: new DOMException('Aborted', 'AbortError') });
      controller.abort();
    };
    parent.addEventListener('abort', abort, { once: true });
    timer = timers.schedule(() => {
      settle({ error: new RequestDeadlineError() });
      controller.abort();
    }, timeoutMs);
    if (parent.aborted) { abort(); return; }
    try {
      task(controller.signal).then(
        (value) => settle({ value }),
        (error) => settle({ error }),
      );
    } catch (error) {
      settle({ error });
    }
  });
}
