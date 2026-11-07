import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestDeadlineError, withRequestDeadline } from '../src/request-deadline';

function fakeTimers() {
  const callbacks = new Map<number, () => void>();
  let id = 0;
  return {
    callbacks,
    schedule: (callback: () => void) => { callbacks.set(++id, callback); return id; },
    unschedule: (handle: unknown) => { callbacks.delete(handle as number); },
    expire: () => { for (const callback of [...callbacks.values()]) callback(); },
  };
}

test('a config operation that never resolves still rejects and aborts at its deadline', async () => {
  const timers = fakeTimers();
  let taskSignal!: AbortSignal;
  const pending = withRequestDeadline((signal) => {
    taskSignal = signal;
    return new Promise(() => {});
  }, new AbortController().signal, 15_000, timers);
  timers.expire();
  await assert.rejects(pending, RequestDeadlineError);
  assert.equal(taskSignal.aborted, true);
  assert.equal(timers.callbacks.size, 0);
});

test('late completion of a timed-out operation cannot affect a fresh retry', async () => {
  const timers = fakeTimers();
  let lateResolve!: (value: string) => void;
  const old = withRequestDeadline(() => new Promise<string>((resolve) => { lateResolve = resolve; }), new AbortController().signal, 15_000, timers);
  timers.expire();
  await assert.rejects(old, RequestDeadlineError);
  const retry = withRequestDeadline(async () => 'fresh config', new AbortController().signal, 15_000, timers);
  lateResolve('stale config');
  assert.equal(await retry, 'fresh config');
  assert.equal(timers.callbacks.size, 0);
});

test('caller cancellation clears the deadline and cancels the underlying operation', async () => {
  const timers = fakeTimers();
  const parent = new AbortController();
  let taskSignal!: AbortSignal;
  const pending = withRequestDeadline((signal) => { taskSignal = signal; return new Promise(() => {}); }, parent.signal, 15_000, timers);
  parent.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(taskSignal.aborted, true);
  assert.equal(timers.callbacks.size, 0);
});

test('successful and synchronously failed operations clean up their deadlines', async () => {
  const timers = fakeTimers();
  assert.equal(await withRequestDeadline(async () => 'config', new AbortController().signal, 15_000, timers), 'config');
  await assert.rejects(withRequestDeadline(() => { throw new Error('failure'); }, new AbortController().signal, 15_000, timers), /failure/);
  assert.equal(timers.callbacks.size, 0);
});
