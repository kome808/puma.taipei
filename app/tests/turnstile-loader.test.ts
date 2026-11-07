import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitWithAbort, createTurnstileLoader } from '../src/turnstile-loader';
import type { TurnstileApi } from '../src/turnstile-verifier';

class Script extends EventTarget {
  dataset: Record<string, string> = {};
  src = '';
  async = false;
  defer = false;
  removed = false;
  remove() { this.removed = true; }
}

function harness() {
  let api: TurnstileApi | undefined;
  const scripts: Script[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const document = {
    querySelector: () => scripts.find((script) => !script.removed),
    createElement: () => new Script(),
    head: { appendChild: (script: Script) => { scripts.push(script); } },
  } as unknown as Document;
  const load = createTurnstileLoader({
    document,
    getApi: () => api,
    schedule: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    unschedule: (handle) => { timers.delete(handle as number); },
  });
  return {
    load, scripts, timers,
    setApi: () => (api = { render: () => 'widget', remove: () => {} }),
    expire: () => { for (const callback of [...timers.values()]) callback(); },
  };
}

test('concurrent SDK waits share one load and clean up after a slow successful load', async () => {
  const h = harness();
  const first = h.load();
  const second = h.load();
  assert.equal(first, second);
  assert.equal(h.scripts.length, 1);
  assert.equal(h.scripts[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  const api = h.setApi();
  h.scripts[0].dispatchEvent(new Event('load'));
  assert.equal(await first, api);
  assert.equal(await h.load(), api);
  assert.equal(h.timers.size, 0);
});

test('SDK timeout removes the failed script and a retry starts a fresh load', async () => {
  const h = harness();
  const first = h.load();
  h.expire();
  await assert.rejects(first, /載入較久/);
  assert.equal(h.scripts[0].removed, true);
  const retry = h.load();
  assert.equal(h.scripts.length, 2);
  const api = h.setApi();
  h.scripts[1].dispatchEvent(new Event('load'));
  assert.equal(await retry, api);
});

test('loaded script without an API cannot leave a forever-pending retry', async () => {
  const h = harness();
  const first = h.load();
  h.scripts[0].dispatchEvent(new Event('load'));
  await assert.rejects(first, /未能啟動/);
  const retry = h.load();
  h.scripts[1].dispatchEvent(new Event('error'));
  await assert.rejects(retry, /載入失敗/);
  assert.equal(h.timers.size, 0);
});

test('an aborted caller does not cancel SDK preload or another caller', async () => {
  const h = harness();
  const controller = new AbortController();
  const load = h.load();
  const first = awaitWithAbort(load, controller.signal);
  const second = awaitWithAbort(h.load(), new AbortController().signal);
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  const api = h.setApi();
  h.scripts[0].dispatchEvent(new Event('load'));
  assert.equal(await second, api);
  assert.equal(h.scripts[0].removed, false);
});
