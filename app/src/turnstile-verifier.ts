export type TurnstileFailureReason = 'timeout' | 'unsupported' | 'expired' | 'failed';

export interface TurnstileRenderOptions {
  sitekey: string;
  action: 'generate';
  execution: 'render';
  appearance: 'always';
  size: 'compact';
  theme: 'light';
  'response-field': false;
  retry: 'auto';
  callback: (token: string) => void;
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
  'timeout-callback': () => void;
  'expired-callback': () => void;
  'unsupported-callback': () => void;
  'error-callback': (code?: number | string) => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | number;
  remove(id: string | number): void;
}

export class TurnstileVerificationError extends Error {
  readonly reason: TurnstileFailureReason;

  constructor(reason: TurnstileFailureReason, message: string) {
    super(message);
    this.name = 'TurnstileVerificationError';
    this.reason = reason;
  }
}

type TimerHandle = unknown;
type Schedule = (callback: () => void, milliseconds: number) => TimerHandle;
type Unschedule = (handle: TimerHandle) => void;

type VerifierOptions = {
  api: TurnstileApi;
  container: HTMLElement;
  siteKey: string;
  onInteractionRequired?: (required: boolean) => void;
  onRetry?: (code: string) => void;
  timeoutMs?: number;
  interactiveTimeoutMs?: number;
  schedule?: Schedule;
  unschedule?: Unschedule;
};

type PendingAttempt = {
  id: number;
  signal: AbortSignal;
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
  abortListener: () => void;
  timer: TimerHandle | null;
  widgetId: string | number | null;
  settled: boolean;
  cleaned: boolean;
  removed: boolean;
  removeAfterRender: boolean;
  interactionRequired: boolean;
  interactiveTimerStarted: boolean;
  errorCode: string;
};

const FATAL_ERROR_CODES = new Set([
  '110100',
  '110110',
  '110200',
  '200100',
  '400020',
  '400021',
  '400070',
]);

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERACTIVE_TIMEOUT_MS = 180_000;

function abortError(): DOMException {
  return new DOMException('Turnstile verification was aborted', 'AbortError');
}

function timeoutError(code = ''): TurnstileVerificationError {
  return new TurnstileVerificationError('timeout', `安全驗證未能完成，請再試一次。${code ? `（驗證代碼：${code}）` : ''}`);
}

function failedError(message = '安全驗證暫時無法完成，請再試一次。'): TurnstileVerificationError {
  return new TurnstileVerificationError('failed', message);
}

function expiredError(): TurnstileVerificationError {
  return new TurnstileVerificationError('expired', '安全驗證已過期，請再試一次。');
}

function unsupportedError(): TurnstileVerificationError {
  return new TurnstileVerificationError('unsupported', '目前瀏覽器不支援安全驗證，請改用其他瀏覽器。');
}

function normalizeErrorCode(code: number | string | undefined): string {
  return code === undefined || code === null ? '' : String(code);
}

export function createTurnstileVerifier(options: VerifierOptions): {
  verify(signal: AbortSignal): Promise<string>;
  cancel(): void;
} {
  const schedule: Schedule = options.schedule ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
  const unschedule: Unschedule = options.unschedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const interactiveTimeoutMs = options.interactiveTimeoutMs ?? DEFAULT_INTERACTIVE_TIMEOUT_MS;
  let nextAttemptId = 0;
  let activeAttempt: PendingAttempt | null = null;

  const removeWidget = (attempt: PendingAttempt): void => {
    if (attempt.removed || attempt.widgetId === null) return;
    attempt.removed = true;
    try {
      options.api.remove(attempt.widgetId);
    } catch {
      // A widget that already disappeared is still terminal for this attempt.
    }
  };

  const cleanup = (attempt: PendingAttempt): void => {
    if (attempt.cleaned) return;
    attempt.cleaned = true;
    if (attempt.timer !== null) {
      try {
        unschedule(attempt.timer);
      } catch {
        // A scheduler cleanup failure must not keep a settled Promise alive.
      }
      attempt.timer = null;
    }
    attempt.signal.removeEventListener('abort', attempt.abortListener);
    if (attempt.interactionRequired) {
      attempt.interactionRequired = false;
      options.onInteractionRequired?.(false);
    }
    if (attempt.widgetId === null) {
      // render() may synchronously invoke a callback before returning its id.
      attempt.removeAfterRender = true;
    } else {
      removeWidget(attempt);
    }
    if (activeAttempt === attempt) activeAttempt = null;
  };

  const settle = (
    attempt: PendingAttempt,
    outcome: { token: string } | { error: unknown },
  ): void => {
    if (attempt.settled) return;
    attempt.settled = true;
    cleanup(attempt);
    if ('token' in outcome) {
      attempt.resolve(outcome.token);
    } else {
      attempt.reject(outcome.error);
    }
  };

  const cancelAttempt = (attempt: PendingAttempt): void => {
    settle(attempt, { error: abortError() });
  };

  const cancel = (): void => {
    if (activeAttempt) cancelAttempt(activeAttempt);
  };

  const verify = (signal: AbortSignal): Promise<string> => {
    cancel();
    if (signal.aborted) return Promise.reject(abortError());

    let attempt!: PendingAttempt;
    const promise = new Promise<string>((resolve, reject) => {
      const id = ++nextAttemptId;
      const abortListener = () => {
        if (activeAttempt === attempt) settle(attempt, { error: abortError() });
      };
      attempt = {
        id,
        signal,
        resolve,
        reject,
        abortListener,
        timer: null,
        widgetId: null,
        settled: false,
        cleaned: false,
        removed: false,
        removeAfterRender: false,
        interactionRequired: false,
        interactiveTimerStarted: false,
        errorCode: '',
      };
      activeAttempt = attempt;

      const scheduleTimeout = (milliseconds: number) => {
        if (attempt.settled) return;
        if (attempt.timer !== null) {
          try {
            unschedule(attempt.timer);
          } catch {
            // The new watchdog still protects this attempt.
          }
        }
        try {
          attempt.timer = schedule(() => settle(attempt, { error: timeoutError(attempt.errorCode) }), milliseconds);
        } catch {
          settle(attempt, { error: failedError('安全驗證計時器無法啟動，請再試一次。') });
        }
      };

      const handleBeforeInteractive = () => {
        if (attempt.settled) return;
        if (!attempt.interactionRequired) {
          attempt.interactionRequired = true;
          options.onInteractionRequired?.(true);
        }
        if (!attempt.interactiveTimerStarted) {
          attempt.interactiveTimerStarted = true;
          scheduleTimeout(interactiveTimeoutMs);
        }
      };

      const handleAfterInteractive = () => {
        if (attempt.settled || !attempt.interactionRequired) return;
        attempt.interactionRequired = false;
        options.onInteractionRequired?.(false);
      };

      const renderOptions: TurnstileRenderOptions = {
        sitekey: options.siteKey,
        action: 'generate',
        execution: 'render',
        appearance: 'always',
        size: 'compact',
        theme: 'light',
        'response-field': false,
        retry: 'auto',
        callback: (token) => {
          if (attempt.settled) return;
          if (!token) {
            settle(attempt, { error: failedError('安全驗證沒有回傳有效憑證，請再試一次。') });
            return;
          }
          settle(attempt, { token });
        },
        'before-interactive-callback': handleBeforeInteractive,
        'after-interactive-callback': handleAfterInteractive,
        'timeout-callback': () => settle(attempt, { error: timeoutError(attempt.errorCode) }),
        'expired-callback': () => settle(attempt, { error: expiredError() }),
        'unsupported-callback': () => settle(attempt, { error: unsupportedError() }),
        'error-callback': (code) => {
          if (attempt.settled) return;
          const normalized = normalizeErrorCode(code);
          attempt.errorCode = /^\d{6}$/.test(normalized) ? normalized : '';
          if (FATAL_ERROR_CODES.has(normalized)) {
            settle(attempt, { error: failedError(`安全驗證無法啟動，請重新整理後再試。${attempt.errorCode ? `（驗證代碼：${attempt.errorCode}）` : ''}`) });
          } else {
            options.onRetry?.(attempt.errorCode);
          }
          // Other error codes are left to Turnstile's retry: 'auto' behaviour.
        },
      };

      signal.addEventListener('abort', abortListener, { once: true });
      if (signal.aborted) {
        settle(attempt, { error: abortError() });
        return;
      }
      scheduleTimeout(timeoutMs);
      if (attempt.settled) return;

      try {
        const widgetId = options.api.render(options.container, renderOptions);
        attempt.widgetId = widgetId;
        if (attempt.removeAfterRender || attempt.settled) removeWidget(attempt);
      } catch {
        if (!attempt.settled) settle(attempt, { error: failedError('安全驗證元件無法啟動，請再試一次。') });
      }
    });

    return promise;
  };

  return { verify, cancel };
}
