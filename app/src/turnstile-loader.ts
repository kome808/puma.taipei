import type { TurnstileApi } from './turnstile-verifier';

const SDK_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const OWNER = 'policy-with-sources';

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type LoaderOptions = {
  document: Document;
  getApi: () => TurnstileApi | undefined;
  timeoutMs?: number;
  schedule?: (callback: () => void, milliseconds: number) => unknown;
  unschedule?: (handle: unknown) => void;
};

export function createTurnstileLoader(options: LoaderOptions): () => Promise<TurnstileApi> {
  let pending: Promise<TurnstileApi> | null = null;
  const schedule = options.schedule ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
  const unschedule = options.unschedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  return () => {
    const available = options.getApi();
    if (available) return Promise.resolve(available);
    if (pending) return pending;

    // With no pending load and no API, an owned script is stale. Its load event
    // may have already fired; attaching another listener would never finish.
    options.document.querySelector<HTMLScriptElement>(
      `script[data-policy-turnstile-owner="${OWNER}"]`,
    )?.remove();

    const script = options.document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = SDK_URL;
    script.dataset.policyTurnstileOwner = OWNER;

    const attempt = new Promise<TurnstileApi>((resolve, reject) => {
      let settled = false;
      let timer: unknown;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        unschedule(timer);
        script.removeEventListener('load', loaded);
        script.removeEventListener('error', failed);
        const api = options.getApi();
        if (error || !api) {
          script.remove();
          reject(error ?? new Error('安全驗證未能啟動，請再試一次。'));
        } else {
          resolve(api);
        }
      };
      const loaded = () => finish();
      const failed = () => finish(new Error('安全驗證載入失敗，請確認網路後再試一次。'));
      script.addEventListener('load', loaded);
      script.addEventListener('error', failed);
      timer = schedule(
        () => finish(new Error('安全驗證載入較久，請確認網路後再試一次。')),
        options.timeoutMs ?? 30_000,
      );
      try {
        options.document.head.appendChild(script);
      } catch {
        failed();
      }
    });
    pending = attempt;
    const clearPending = () => {
      if (pending === attempt) pending = null;
    };
    void attempt.then(clearPending, clearPending);
    return attempt;
  };
}

let browserLoader: (() => Promise<TurnstileApi>) | undefined;
export function loadTurnstileSdk(): Promise<TurnstileApi> {
  browserLoader ??= createTurnstileLoader({ document, getApi: () => window.turnstile });
  return browserLoader();
}

// Cancel just this caller's wait, without interrupting a shared SDK preload.
export function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
