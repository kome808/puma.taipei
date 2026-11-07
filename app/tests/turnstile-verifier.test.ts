import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTurnstileVerifier,
  TurnstileVerificationError,
  type TurnstileApi,
  type TurnstileRenderOptions,
} from '../src/turnstile-verifier';

type Timer = { id: number; due: number; callback: () => void };

class FakeScheduler {
  now = 0;
  private nextId = 1;
  private timers = new Map<number, Timer>();

  schedule = (callback: () => void, milliseconds: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { id, due: this.now + milliseconds, callback });
    return id;
  };

  unschedule = (handle: unknown): void => {
    this.timers.delete(handle as number);
  };

  advance(milliseconds: number): void {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.timers.values()]
        .filter((timer) => timer.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next) break;
      this.timers.delete(next.id);
      this.now = next.due;
      next.callback();
    }
    this.now = target;
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

type RenderRecord = { id: string; options: TurnstileRenderOptions };

class FakeTurnstileApi implements TurnstileApi {
  renders: RenderRecord[] = [];
  removed: Array<string | number> = [];
  onRender?: (record: RenderRecord) => void;
  throwOnRender = false;

  render(_container: HTMLElement, options: TurnstileRenderOptions): string {
    if (this.throwOnRender) throw new Error('render failed');
    const record = { id: `widget-${this.renders.length + 1}`, options };
    this.renders.push(record);
    this.onRender?.(record);
    return record.id;
  }

  remove(id: string | number): void {
    this.removed.push(id);
  }

  get latest(): RenderRecord {
    const record = this.renders.at(-1);
    if (!record) throw new Error('No widget rendered');
    return record;
  }
}

function createHarness(overrides: Partial<Parameters<typeof createTurnstileVerifier>[0]> = {}) {
  const scheduler = new FakeScheduler();
  const api = new FakeTurnstileApi();
  const verifier = createTurnstileVerifier({
    api,
    container: {} as HTMLElement,
    siteKey: 'site-key',
    schedule: scheduler.schedule,
    unschedule: scheduler.unschedule,
    ...overrides,
  });
  return { api, scheduler, verifier };
}

function isVerificationError(reason: TurnstileVerificationError['reason']) {
  return (error: unknown): boolean => error instanceof TurnstileVerificationError && error.reason === reason;
}

test('renders a fresh managed widget with the required generation settings', async () => {
  const { api, verifier } = createHarness();
  const promise = verifier.verify(new AbortController().signal);
  const { options } = api.latest;

  assert.equal(options.sitekey, 'site-key');
  assert.equal(options.action, 'generate');
  assert.equal(options.execution, 'render');
  assert.equal(options.appearance, 'always');
  assert.equal(options.size, 'compact');
  assert.equal(options.theme, 'light');
  assert.equal(options['response-field'], false);
  assert.equal(options.retry, 'auto');

  options.callback('fresh-token');
  assert.equal(await promise, 'fresh-token');
  assert.deepEqual(api.removed, ['widget-1']);
});

test('a 20-second verification does not hit the old 15-second timeout', async () => {
  const { api, scheduler, verifier } = createHarness({ timeoutMs: 60_000 });
  const promise = verifier.verify(new AbortController().signal);

  scheduler.advance(20_000);
  api.latest.options.callback('after-twenty-seconds');

  assert.equal(await promise, 'after-twenty-seconds');
  assert.equal(scheduler.pendingCount, 0);
});

test('watchdog timeout removes the widget and the next verify can start fresh', async () => {
  const { api, scheduler, verifier } = createHarness({ timeoutMs: 60_000 });
  const first = verifier.verify(new AbortController().signal);

  scheduler.advance(60_000);
  await assert.rejects(first, isVerificationError('timeout'));
  assert.deepEqual(api.removed, ['widget-1']);

  const second = verifier.verify(new AbortController().signal);
  assert.equal(api.renders.length, 2);
  api.latest.options.callback('second-token');
  assert.equal(await second, 'second-token');
  assert.deepEqual(api.removed, ['widget-1', 'widget-2']);
});

test('aborting an attempt cannot let its late callback resolve the next request', async () => {
  const { api, verifier } = createHarness();
  const firstController = new AbortController();
  const first = verifier.verify(firstController.signal);
  const firstOptions = api.latest.options;

  const secondController = new AbortController();
  const second = verifier.verify(secondController.signal);
  await assert.rejects(first, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');

  firstOptions.callback('stale-token');
  api.latest.options.callback('current-token');
  assert.equal(await second, 'current-token');
  assert.deepEqual(api.removed, ['widget-1', 'widget-2']);
});

test('a synchronous callback during render is cleaned up after render returns its id', async () => {
  const { api, verifier } = createHarness();
  api.onRender = (record) => record.options.callback('synchronous-token');

  const promise = verifier.verify(new AbortController().signal);
  assert.equal(await promise, 'synchronous-token');
  assert.deepEqual(api.removed, ['widget-1']);
});

test('render exceptions fail and clear the watchdog without a widget leak', async () => {
  const { api, scheduler, verifier } = createHarness();
  api.throwOnRender = true;

  const promise = verifier.verify(new AbortController().signal);
  await assert.rejects(promise, isVerificationError('failed'));
  assert.equal(scheduler.pendingCount, 0);
  assert.deepEqual(api.removed, []);
});

test('expired, unsupported, and fatal configuration errors fail immediately', async (t) => {
  const cases: Array<['timeout' | 'expired' | 'unsupported' | 'failed', (options: TurnstileRenderOptions) => void]> = [
    ['timeout', (options) => options['timeout-callback']()],
    ['expired', (options) => options['expired-callback']()],
    ['unsupported', (options) => options['unsupported-callback']()],
    ['failed', (options) => options['error-callback']('110100')],
  ];

  for (const [reason, trigger] of cases) {
    await t.test(reason, async () => {
      const { api, scheduler, verifier } = createHarness();
      const promise = verifier.verify(new AbortController().signal);
      trigger(api.latest.options);
      await assert.rejects(promise, isVerificationError(reason));
      assert.equal(scheduler.pendingCount, 0);
      assert.deepEqual(api.removed, ['widget-1']);
    });
  }
});

test('retryable error leaves Turnstile auto-retry alive until success', async () => {
  const { api, scheduler, verifier } = createHarness({ timeoutMs: 60_000 });
  const promise = verifier.verify(new AbortController().signal);

  api.latest.options['error-callback']('110000');
  scheduler.advance(59_999);
  api.latest.options.callback('retry-success');

  assert.equal(await promise, 'retry-success');
  assert.deepEqual(api.removed, ['widget-1']);
});

test('interactive mode extends the watchdog and reports interaction state', async () => {
  const interaction: boolean[] = [];
  const { api, scheduler, verifier } = createHarness({
    timeoutMs: 60_000,
    interactiveTimeoutMs: 180_000,
    onInteractionRequired: (required) => interaction.push(required),
  });
  const promise = verifier.verify(new AbortController().signal);

  api.latest.options['before-interactive-callback']();
  assert.deepEqual(interaction, [true]);
  scheduler.advance(120_000);
  api.latest.options['after-interactive-callback']();
  assert.deepEqual(interaction, [true, false]);
  api.latest.options.callback('interactive-success');

  assert.equal(await promise, 'interactive-success');
  assert.deepEqual(api.removed, ['widget-1']);
});

test('repeated interactive callbacks cannot postpone timeout indefinitely', async () => {
  const { api, scheduler, verifier } = createHarness();
  const promise = verifier.verify(new AbortController().signal);
  const options = api.latest.options;
  options['before-interactive-callback']();
  for (let index = 0; index < 17; index++) {
    scheduler.advance(10_000);
    options['after-interactive-callback']();
    options['before-interactive-callback']();
  }
  let rejected = false;
  const rejection = promise.catch((error) => {
    rejected = isVerificationError('timeout')(error);
  });
  scheduler.advance(10_000);
  await Promise.resolve();
  assert.equal(rejected, true, 'interactive retries must retain their original deadline');
  await rejection;
  assert.equal(scheduler.pendingCount, 0);
});

test('retryable errors report only a safe diagnostic code and retain it on timeout', async () => {
  const codes: string[] = [];
  const { api, scheduler, verifier } = createHarness({ onRetry: (code) => codes.push(code) });
  const pending = verifier.verify(new AbortController().signal);
  api.latest.options['error-callback']('200500');
  assert.deepEqual(codes, ['200500']);
  scheduler.advance(60_000);
  await assert.rejects(pending, (error: unknown) => error instanceof TurnstileVerificationError && error.message.includes('200500'));
  api.latest.options['error-callback']('300010');
  assert.deepEqual(codes, ['200500'], 'late error callbacks must not update a settled attempt');
});
