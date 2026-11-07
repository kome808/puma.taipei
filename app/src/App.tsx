import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import type {
  ApiError,
  Evidence,
  GeneratedPost,
  Mode,
  PostSource,
  SearchResult,
  SourceKind,
} from '../shared/contracts';
import { assemblePost, countCharacters, isPostWithinLimit, sourceSuffix } from '../shared/post';
import KonnyakuIllustration from './KonnyakuIllustration';
import { awaitWithAbort, loadTurnstileSdk } from './turnstile-loader';
import { createTurnstileVerifier, TurnstileVerificationError } from './turnstile-verifier';
import { RequestDeadlineError, withRequestDeadline } from './request-deadline';

const POST_LIMIT = 500;
const MAX_QUERY_LENGTH = 3000;

type Config = {
  turnstileSiteKey: string | null;
  stats: { sources: number; passages: number; version: string; updatedAt: string | null };
  live: boolean;
};

type LoadingAction = 'generate' | null;
type VerificationStage = 'config' | 'sdk' | 'challenge' | null;
type CopyState = 'idle' | 'copied' | 'manual';
const SOURCE_ORDER: Record<SourceKind, number> = { official: 0, framework: 0, interview: 1, article: 2 };

class ApiRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiRequestError('NETWORK', '目前無法連線。');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the user-facing message below; a malformed response is not a source result.
  }

  if (!response.ok) {
    const apiError = payload as Partial<ApiError> | null;
    const details = apiError?.error;
    throw new ApiRequestError(
      typeof details?.code === 'string' ? details.code : `HTTP_${response.status}`,
      typeof details?.message === 'string' ? details.message : '服務暫時無法回應。',
    );
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object'
  ) {
    const details = payload.error as { code?: unknown; message?: unknown };
    throw new ApiRequestError(
      typeof details.code === 'string' ? details.code : 'API_ERROR',
      typeof details.message === 'string' ? details.message : '服務暫時無法回應。',
    );
  }

  return payload as T;
}

function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case 'official':
      return '官方政策';
    case 'interview':
      return '訪談';
    case 'article':
      return '整理文章';
    case 'framework':
      return '政策架構';
    default:
      return '公開資料';
  }
}

function sourceKindClass(kind: SourceKind): string {
  return `source-kind source-kind-${kind}`;
}

function passagePreview(text: string, limit = 180): string {
  const clean = text.trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
}

function scrollToResult(target: HTMLElement | null, block: ScrollLogicalPosition = 'start'): void {
  if (!target || typeof target.scrollIntoView !== 'function') return;
  const reducedMotion = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block });
}

function friendlyError(error: unknown): string {
  if (error instanceof TurnstileVerificationError) return error.message;
  if (error instanceof RequestDeadlineError) return '安全驗證未能完成，請按「再試一次」。';
  if (error instanceof ApiRequestError) {
    const safeApiErrorCodes = new Set([
      'INVALID_INPUT',
      'INPUT_TOO_LONG',
      'POST_TOO_LONG',
      'VERIFICATION_REQUIRED',
      'VERIFICATION_FAILED',
      'CHALLENGE_FAILED',
      'SERVICE_NOT_READY',
      'CONFIG_TIMEOUT',
      'AI_UNAVAILABLE',
      'AI_TIMEOUT',
      'TIMEOUT',
      'AI_PROVIDER_ERROR',
      'PROVIDER_ERROR',
      'INVALID_CITATION',
    ]);
    if (safeApiErrorCodes.has(error.code) && error.message) return error.message;

    switch (error.code) {
      case 'NO_RESULTS':
      case 'NO_SOURCE':
      case 'NO_EVIDENCE':
        return '目前找不到足夠的相關資料。換個關鍵字，或把問題說細一點，再查一次。';
      case 'RATE_LIMITED':
      case 'RATE_LIMIT':
        return '目前查詢的人較多，請稍後再查一次。';
      case 'INVALID_QUERY':
        return '請先輸入一個主題，或貼上想查的問題。';
      case 'GENERATION_FAILED':
      case 'MODEL_ERROR':
        return '這次沒有整理成功，請再查一次。';
      case 'NETWORK':
        return '目前連不上服務，請確認網路後再試。';
      default:
        return '這次查詢中斷了，請稍後再查一次。';
    }
  }

  if (error instanceof DOMException && error.name === 'AbortError') return '';
  return '這次查詢中斷了，請稍後再查一次。';
}

function normaliseSources(result: GeneratedPost | SearchResult): PostSource[] {
  const fromResponse = 'sources' in result && Array.isArray(result.sources) ? result.sources : [];
  if (fromResponse.length > 0) {
    return fromResponse
      .filter((source): source is PostSource => Boolean(source?.id && source?.url))
      .map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        kind: source.kind,
      }));
  }

  const seen = new Set<string>();
  return result.results
    .filter((evidence) => {
      const key = evidence.url || evidence.sourceId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((evidence) => ({
      id: evidence.sourceId || evidence.id,
      title: evidence.title,
      url: evidence.url,
      kind: evidence.kind,
    }));
}

function isEvidence(value: unknown): value is Evidence {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Evidence).id === 'string' &&
      typeof (value as Evidence).url === 'string',
  );
}

function initialConfig(): Config {
  return {
    turnstileSiteKey: null,
    stats: { sources: 0, passages: 0, version: '', updatedAt: null },
    live: false,
  };
}

function App() {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'share';
    return new URLSearchParams(window.location.search).get('mode') === 'reply' ? 'reply' : 'share';
  });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [draftPost, setDraftPost] = useState('');
  const [draftSources, setDraftSources] = useState<PostSource[]>([]);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [config, setConfig] = useState<Config>(initialConfig);
  const [verificationStage, setVerificationStage] = useState<VerificationStage>(null);
  const [verificationIssue, setVerificationIssue] = useState('');
  const [interactionRequired, setInteractionRequired] = useState(false);
  const [slowRequest, setSlowRequest] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const requestNumberRef = useRef(0);
  const previewRef = useRef<HTMLTextAreaElement | null>(null);
  const draftHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const verifierRef = useRef<{
    siteKey: string;
    verifier: ReturnType<typeof createTurnstileVerifier>;
  } | null>(null);

  const evidence = useMemo(() => {
    if (generated?.results?.length) {
      const citedSources = new Set(generated.sources.map((source) => source.id));
      return generated.results.filter(isEvidence)
        .filter((item) => citedSources.has(item.sourceId))
        .sort((a, b) => SOURCE_ORDER[a.kind] - SOURCE_ORDER[b.kind]);
    }
    return [];
  }, [generated]);

  const assembledPost = draftPost;
  const requiredSourceSuffix = sourceSuffix(draftSources);
  const validSourceFooter = Boolean(requiredSourceSuffix && assembledPost.endsWith(requiredSourceSuffix));
  const draftBody = validSourceFooter ? assembledPost.slice(0, -requiredSourceSuffix.length) : '';
  const characterCount = countCharacters(assembledPost);
  const hasFreshSources = draftSources.length > 0;
  const canCopy = Boolean(
    loading === null &&
      draftBody.trim() &&
      hasFreshSources &&
      validSourceFooter &&
      isPostWithinLimit(assembledPost) &&
      characterCount <= POST_LIMIT,
  );

  const clearOutput = useCallback(() => {
    setGenerated(null);
    setDraftPost('');
    setDraftSources([]);
    setCopyState('idle');
  }, []);

  const getTurnstileToken = useCallback(
    async (signal: AbortSignal): Promise<string | null> => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      let siteKey = config.turnstileSiteKey;
      if (!siteKey) {
        // A slow initial config request must not send a production query without
        // verification. Try config again within this cancellable request.
        setVerificationStage('config');
        let freshConfig: Config;
        try {
          freshConfig = await withRequestDeadline(
            (configSignal) => requestJson<Config>('/api/config', { method: 'GET', signal: configSignal }),
            signal,
            15_000,
          );
        } catch (error) {
          if (error instanceof RequestDeadlineError) throw new ApiRequestError('CONFIG_TIMEOUT', '網站設定讀取逾時，請按「再試一次」。');
          throw error;
        }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        siteKey = freshConfig.turnstileSiteKey;
        if (!siteKey && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return null;
        if (!siteKey) throw new ApiRequestError('SERVICE_NOT_READY', '安全驗證尚未準備好，請稍後再試。');
      }

      let api;
      try {
        setVerificationStage('sdk');
        api = await awaitWithAbort(loadTurnstileSdk(), signal);
      } catch (error) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        throw new ApiRequestError('CHALLENGE_FAILED', error instanceof Error ? error.message : '安全驗證載入失敗，請再試一次。');
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!turnstileContainerRef.current) throw new ApiRequestError('CHALLENGE_FAILED', '安全驗證尚未準備好，請再試一次。');
      setVerificationStage('challenge');

      if (!verifierRef.current || verifierRef.current.siteKey !== siteKey) {
        verifierRef.current?.verifier.cancel();
        verifierRef.current = {
          siteKey,
          verifier: createTurnstileVerifier({
            api,
            container: turnstileContainerRef.current,
            siteKey,
            onInteractionRequired: (required) => {
              if (!controllerRef.current?.signal.aborted) setInteractionRequired(required);
            },
            onRetry: (code) => {
              if (!controllerRef.current?.signal.aborted) setVerificationIssue(code || 'unknown');
            },
          }),
        };
      }
      return verifierRef.current.verifier.verify(signal);
    },
    [config.turnstileSiteKey],
  );

  useEffect(() => {
    if (config.turnstileSiteKey) void loadTurnstileSdk().catch(() => {
      // Preloading is optional. A query can start a fresh load after a failure.
    });
  }, [config.turnstileSiteKey]);

  useEffect(() => {
    const controller = new AbortController();
    withRequestDeadline(
      (signal) => requestJson<Config>('/api/config', { method: 'GET', signal }),
      controller.signal,
      15_000,
    )
      .then((payload) => {
        if (!payload || typeof payload !== 'object') return;
        setConfig({
          turnstileSiteKey: typeof payload.turnstileSiteKey === 'string' ? payload.turnstileSiteKey : null,
          stats: {
            sources: Number(payload.stats?.sources) || 0,
            passages: Number(payload.stats?.passages) || 0,
            version: typeof payload.stats?.version === 'string' ? payload.stats.version : '',
            updatedAt: typeof payload.stats?.updatedAt === 'string' ? payload.stats.updatedAt : null,
          },
          live: Boolean(payload.live),
        });
      })
      .catch(() => {
        // Local development can work without config; never invent corpus results here.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (verificationStage === 'challenge') scrollToResult(turnstileContainerRef.current, 'nearest');
  }, [verificationStage, interactionRequired]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      verifierRef.current?.verifier.cancel();
    };
  }, []);

  useEffect(() => {
    if (loading !== null) return;
    if (generated) {
      scrollToResult(
        evidence.length > 0 || draftSources.length > 0
          ? draftHeadingRef.current
          : emptyHeadingRef.current,
      );
      return;
    }
  }, [draftSources.length, evidence.length, generated, loading]);

  const stopPreviousRequest = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    requestNumberRef.current += 1;
    return { controller, requestNumber: requestNumberRef.current };
  }, []);

  const invalidateActiveRequest = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestNumberRef.current += 1;
    setLoading(null);
    setVerificationStage(null);
    setVerificationIssue('');
    setInteractionRequired(false);
  }, []);

  const setModeAndClear = useCallback(
    (nextMode: Mode) => {
      if (nextMode === mode) return;
      invalidateActiveRequest();
      setMode(nextMode);
      setQuery('');
      setError('');
      setNotice('');
      clearOutput();
    },
    [clearOutput, invalidateActiveRequest, mode],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      invalidateActiveRequest();
      clearOutput();
      setQuery(value);
      setError(value.length > MAX_QUERY_LENGTH ? `這段超過 ${MAX_QUERY_LENGTH.toLocaleString()} 字元了，請先精簡重點。內容還沒送出。` : '');
      setNotice('');
    },
    [clearOutput, invalidateActiveRequest],
  );

  const generate = useCallback(async () => {
    const trimmed = query.trim();
    if (query.length > MAX_QUERY_LENGTH) {
      setError(`這段超過 ${MAX_QUERY_LENGTH.toLocaleString()} 字元了，請先精簡重點。內容還沒送出。`);
      return;
    }
    if (!trimmed) {
      setError(mode === 'share' ? '請先輸入一個主題，兩三個關鍵字也可以。' : '把想查的問題或文字貼過來，才能找出相關資料。');
      return;
    }

    const { controller, requestNumber } = stopPreviousRequest();
    setLoading('generate');
    setVerificationStage('config');
    setVerificationIssue('');
    setInteractionRequired(false);
    setError('');
    setNotice('');
    setCopyState('idle');

    try {
      const turnstileToken = await withRequestDeadline(
        (signal) => getTurnstileToken(signal),
        controller.signal,
        180_000,
      );
      if (controller.signal.aborted || requestNumber !== requestNumberRef.current) return;
      setVerificationStage(null);
      setVerificationIssue('');
      setInteractionRequired(false);
      const body: { query: string; mode: Mode; turnstileToken?: string } = { query: trimmed, mode };
      if (turnstileToken) body.turnstileToken = turnstileToken;
      const payload = await requestJson<GeneratedPost>('/api/generate', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (requestNumber !== requestNumberRef.current || controller.signal.aborted) return;
      const freshSources = normaliseSources(payload).sort((a, b) => SOURCE_ORDER[a.kind] - SOURCE_ORDER[b.kind]);
      setGenerated(payload);
      setDraftPost(assemblePost(typeof payload.body === 'string' ? payload.body : '', freshSources));
      setDraftSources(freshSources);
      setNotice(
        freshSources.length
          ? ''
          : '這次沒找到能附上的出處，還不能提供摘要。換個主題再試試。',
      );
    } catch (requestError) {
      if (controller.signal.aborted || requestNumber !== requestNumberRef.current) return;
      setError(friendlyError(requestError));
      setGenerated(null);
      setDraftPost('');
      setDraftSources([]);
    } finally {
      if (requestNumber === requestNumberRef.current) {
        setVerificationStage(null);
        setVerificationIssue('');
        setInteractionRequired(false);
        setLoading(null);
      }
    }
  }, [getTurnstileToken, mode, query, stopPreviousRequest]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void generate();
    },
    [generate],
  );

  const retry = useCallback(() => { void generate(); }, [generate]);

  const copyPost = useCallback(async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(assembledPost);
      setCopyState('copied');
      setNotice('複製好了！摘要與來源已一起複製。');
    } catch {
      setCopyState('manual');
      setNotice('瀏覽器沒有允許自動複製，文字已選取。請按 Ctrl／⌘＋C，連同出處一起複製。');
      const preview = previewRef.current;
      if (preview) {
        preview.focus();
        preview.select();
      }
    }
  }, [assembledPost, canCopy]);

  const selectExample = useCallback((example: string) => {
    handleQueryChange(example);
  }, [handleQueryChange]);

  useEffect(() => {
    setSlowRequest(false);
    if (!loading) return;
    const timer = window.setTimeout(() => setSlowRequest(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [loading, verificationStage]);

  const loadingLabel = verificationStage === 'config'
    ? '讀取網站設定中…'
    : verificationStage === 'sdk'
      ? '載入安全驗證中…'
      : verificationStage === 'challenge'
        ? '安全驗證中…'
        : '整理資料中…';
  const progressMessage = interactionRequired
    ? '請完成查詢按鈕下方的安全驗證，完成後會繼續查詢。'
    : verificationIssue
      ? `驗證暫時卡住，正在重試。${verificationIssue !== 'unknown' ? `（驗證代碼：${verificationIssue}）` : ''}`
    : slowRequest
      ? `${loadingLabel} 網路較慢時可能要多等一下，請保持頁面開啟。`
      : loadingLabel;
  const inputLabel = mode === 'share' ? '哪個政策，讓你想多了解？' : '想查的問題或文字';
  const inputHint =
    mode === 'share'
      ? '例如：都更卡住怎麼辦？社區附近能怎麼運動？'
      : '貼上問題或需要查核的文字，整理相關政策、訪談內容與來源。';

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Puma政策筆記首頁">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong>Puma政策筆記</strong>
          </span>
        </a>
        <a className="topics-entry" href="/topics/">逛政策主題 <span aria-hidden="true">↗</span></a>
      </header>

      <main>
        <section className="hero-grid" aria-labelledby="page-title">
          <div className="hero-copy">
            <h1 id="page-title">政策與訪談，<span>一起查個明白。</span></h1>
            <p className="hero-lede">
              選個主題、輸入問題，依公開政策與訪談整理資料摘要並附上原始來源，方便查閱與核對。
            </p>
            <p className="independent-note">
              民間整理，非官方網站。內容依據公開政策與訪談資料。
            </p>
            <div className="hero-art" aria-hidden="true">
              <KonnyakuIllustration />
            </div>
          </div>

          <section className="workbench" aria-labelledby="workbench-title">
            <h2 id="workbench-title">想查哪個主題？</h2>
            <div className="mode-tabs" role="tablist" aria-label="選擇整理方式">
              <button
                className={mode === 'share' ? 'mode-tab is-active' : 'mode-tab'}
                type="button"
                role="tab"
                aria-selected={mode === 'share'}
                onClick={() => setModeAndClear('share')}
              >
                <span>
                  <strong>主題摘要</strong>
                  <small>找政策重點，也看原始出處</small>
                </span>
              </button>
              <button
                className={mode === 'reply' ? 'mode-tab is-active' : 'mode-tab'}
                type="button"
                role="tab"
                aria-selected={mode === 'reply'}
                onClick={() => setModeAndClear('reply')}
              >
                <span>
                  <strong>依問題查資料</strong>
                  <small>從問題找相關政策與訪談</small>
                </span>
              </button>
            </div>

            <form className="query-form" onSubmit={submit}>
              <label htmlFor="policy-query">{inputLabel}</label>
              <textarea
                id="policy-query"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder={inputHint}
                rows={mode === 'share' ? 4 : 6}
                aria-describedby="query-help query-count"
              />
              <div className="field-meta">
                <span id="query-help">{mode === 'share' ? '依原文由AI整理摘要，並附上來源。' : '輸入後會檢索來源，並以AI整理相關資料摘要。'}</span>
                <span id="query-count">{query.length}/{MAX_QUERY_LENGTH}</span>
              </div>
              <div className="action-row">
                <button className="primary-button" type="submit" disabled={loading !== null}>
                  {loading === 'generate' ? loadingLabel : '查詢'}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="turnstile-slot" ref={turnstileContainerRef} role="group" aria-label="Cloudflare 安全驗證" />
              {interactionRequired && <p className="verification-help" role="status">請完成上方驗證，接著就會繼續查詢。</p>}
            </form>

            {mode === 'share' && (
              <div className="examples" aria-label="建議主題">
                <span>也可以從這些主題找起</span>
                <div>
                  {['都更', '社區運動', '肌力與日常活動', '育兒照顧', '交通安全'].map((example) => (
                    <button type="button" key={example} onClick={() => selectExample(example)}>
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </section>

        {(loading || error || notice) && (
          <div className={`live-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
            <span className="live-dot" aria-hidden="true" />
            <span>{error || notice || progressMessage}</span>
            {error && (
              <button className="text-button" type="button" onClick={retry} disabled={loading !== null}>
                再試一次
              </button>
            )}
          </div>
        )}

        {generated && (evidence.length > 0 || draftSources.length > 0) && (
          <DraftPanel
            assembledPost={assembledPost}
            hasBody={Boolean(draftBody.trim())}
            validSourceFooter={validSourceFooter}
            characterCount={characterCount}
            canCopy={canCopy}
            copyState={copyState}
            onPostChange={(nextPost) => {
              setDraftPost(nextPost);
              setCopyState('idle');
              setNotice('');
            }}
            onRestore={() => {
              setDraftPost(assemblePost(generated.body, draftSources));
              setCopyState('idle');
              setNotice('');
            }}
            onCopy={() => void copyPost()}
            previewRef={previewRef}
            headingRef={draftHeadingRef}
          />
        )}

        {generated && evidence.length === 0 && draftSources.length === 0 && (
          <section className="empty-state" aria-live="polite">
            <span className="empty-mark" aria-hidden="true">—</span>
            <h2 ref={emptyHeadingRef}>目前找不到相關資料</h2>
            <p>換個關鍵字，或把問題說細一點再查一次。</p>
          </section>
        )}

        {evidence.length > 0 && (
          <EvidenceSection evidence={evidence} />
        )}
        <SourceWebsites stats={config.stats} />
      </main>

      <footer className="site-footer">
        <div>
          <strong>Puma政策筆記</strong>
          <span>民間整理・非官方網站</span>
          <details className="privacy-note">
            <summary>輸入的文字，會怎麼使用？</summary>
            <p>按下查詢後，系統會檢索相關政策與訪談段落，再將輸入文字及相關來源送到 OpenAI API 整理摘要。本站不保存你的輸入原文，只記錄服務用量與防濫用所需資訊。摘要可手動複製，本站不會代你發文或傳送訊息。</p>
          </details>
        </div>
        <span className="footer-meta">
          {config.stats.sources > 0 ? `已收錄 ${config.stats.sources.toLocaleString('zh-TW')} 個資料來源` : '資料來源清點中'}
        </span>
      </footer>
    </div>
  );
}

type DraftPanelProps = {
  assembledPost: string;
  hasBody: boolean;
  validSourceFooter: boolean;
  characterCount: number;
  canCopy: boolean;
  copyState: CopyState;
  onPostChange: (post: string) => void;
  onRestore: () => void;
  onCopy: () => void;
  previewRef: RefObject<HTMLTextAreaElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
};

function DraftPanel({
  assembledPost,
  hasBody,
  validSourceFooter,
  characterCount,
  canCopy,
  copyState,
  onPostChange,
  onRestore,
  onCopy,
  previewRef,
  headingRef,
}: DraftPanelProps) {
  const overLimit = characterCount > POST_LIMIT;
  useEffect(() => {
    const field = previewRef.current;
    if (!field) return;
    let width = field.clientWidth;
    const fitContent = () => {
      field.style.height = '0px';
      field.style.height = `${field.scrollHeight + 2}px`;
    };
    fitContent();
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      fitContent();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [assembledPost, previewRef]);
  return (
    <section className="draft-panel" aria-labelledby="draft-title">
      <div className="panel-heading">
        <div>
          <h2 id="draft-title" ref={headingRef}>資料摘要</h2>
        </div>
        <span className={`character-count${overLimit ? ' is-over' : ''}`}>
          {characterCount}/{POST_LIMIT} 字元
        </span>
      </div>

      <textarea
        id="share-post"
        className="share-post"
        ref={previewRef}
        aria-label="資料摘要與來源連結"
        aria-describedby={!canCopy ? 'copy-help' : undefined}
        value={assembledPost}
        onChange={(event) => onPostChange(event.target.value)}
        rows={10}
      />
      <div className="copy-row">
        <button className="copy-button" type="button" onClick={onCopy} disabled={!canCopy}>
          {copyState === 'copied' ? '複製好了！' : '複製摘要與來源'}
        </button>
        {!canCopy && (
          <span id="copy-help" className="copy-hint" role="status">
            {!validSourceFooter ? '出處別掉隊！請保留最後的來源連結。' : !hasBody ? '摘要還是空的，請補上有來源依據的內容。' : '摘要與來源超過500字元了，請刪短一些。'}
          </span>
        )}
        {!validSourceFooter && (
          <button className="text-button" type="button" onClick={onRestore}>還原摘要</button>
        )}
      </div>
    </section>
  );
}

function EvidenceSection({
  evidence,
}: {
  evidence: Evidence[];
}) {
  return (
    <section className="evidence-section" aria-labelledby="evidence-title">
      <div className="panel-heading evidence-heading">
        <div>
          <h2 id="evidence-title">資料來源</h2>
        </div>
      </div>
      <div className="evidence-list">
        {evidence.map((item) => (
          <EvidenceCard key={item.id} evidence={item} />
        ))}
      </div>
    </section>
  );
}

function SourceWebsites({ stats }: { stats: Config['stats'] }) {
  return (
    <section className="source-strip" aria-labelledby="source-strip-title">
      <div className="source-strip-heading">
        <h2 id="source-strip-title">網站資料來源</h2>
      </div>
      <div className="source-links" aria-label="資料來源網站">
        <a href="https://puma.taipei/policies" target="_blank" rel="noreferrer">
          <span>官方政策</span>
          <strong>puma.taipei/policies <span aria-hidden="true">↗</span></strong>
        </a>
        <a href="https://puma-hub.pages.dev/#all" target="_blank" rel="noreferrer">
          <span>PUMA HUB・訪談與逐字稿（非官方）</span>
          <strong>puma-hub.pages.dev/#all <span aria-hidden="true">↗</span></strong>
        </a>
      </div>
      <div className="source-strip-meta">
        <span>資料最後更新：{stats.updatedAt || '讀取中'}</span>
        <div className="source-stats" aria-label="已收錄資料">
          {stats.sources > 0 && <span>{stats.sources.toLocaleString('zh-TW')} 個來源</span>}
          {stats.passages > 0 && <span>{stats.passages.toLocaleString('zh-TW')} 段原文</span>}
        </div>
      </div>
    </section>
  );
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const verification = evidence.verification || (evidence.kind === 'interview' ? '提供之逐字稿，尚未影片核驗。' : '尚未提供查核說明。');
  const notes = Array.isArray(evidence.notes) ? evidence.notes.filter(Boolean) : [];
  return (
    <article className="evidence-card">
      <div className="evidence-card-top">
        <span className={sourceKindClass(evidence.kind)}>{sourceKindLabel(evidence.kind)}</span>
      </div>
      <h3>{evidence.title}</h3>
      <p className="evidence-section-name">{evidence.section || '原文段落'}</p>
      <blockquote className="evidence-preview">
        {evidence.text ? passagePreview(evidence.text) : '此來源尚未提供可預覽的原文段落。'}
      </blockquote>
      <details className="evidence-annotations">
        <summary>來源與查核註記</summary>
        <div className="evidence-meta">
          <div>
            <span className="meta-label">查核狀態</span>
            <span>{verification}</span>
          </div>
          {notes.length > 0 && (
            <div>
              <span className="meta-label">備註</span>
              <span>{notes.join('／')}</span>
            </div>
          )}
        </div>
      </details>
      <details>
        <summary>展開完整原文</summary>
        <blockquote>{evidence.text || '此來源尚未提供可展開的原文段落。'}</blockquote>
      </details>
      <a className="source-link" href={evidence.url} target="_blank" rel="noreferrer">
        到原網站看看 <span aria-hidden="true">↗</span>
      </a>
    </article>
  );
}

export default App;
