import test from "node:test";
import assert from "node:assert/strict";

import { createColdStartTimer } from "./coldStartIndicator.js";

function createFakeScheduler() {
  let nextId = 1;
  const pending = new Map();
  return {
    scheduler: {
      setTimeout(fn, ms) {
        const id = nextId++;
        pending.set(id, { fn, ms });
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      },
    },
    fire(ms) {
      for (const [id, { fn, ms: scheduledMs }] of pending) {
        if (scheduledMs <= ms) {
          pending.delete(id);
          fn();
        }
      }
    },
    pendingCount() {
      return pending.size;
    },
  };
}

test("start() schedules onSlow at slowMs and onVerySlow at verySlowMs", () => {
  const { scheduler, fire } = createFakeScheduler();
  let slowCalls = 0;
  let verySlowCalls = 0;
  const timer = createColdStartTimer({
    onSlow: () => slowCalls++,
    onVerySlow: () => verySlowCalls++,
    slowMs: 100,
    verySlowMs: 200,
    scheduler,
  });

  timer.start();
  fire(100);
  assert.equal(slowCalls, 1);
  assert.equal(verySlowCalls, 0);

  fire(200);
  assert.equal(verySlowCalls, 1);
});

test("clear() cancels both pending timers", () => {
  const { scheduler, fire, pendingCount } = createFakeScheduler();
  let slowCalls = 0;
  const timer = createColdStartTimer({
    onSlow: () => slowCalls++,
    onVerySlow: () => {},
    slowMs: 100,
    verySlowMs: 200,
    scheduler,
  });

  timer.start();
  assert.equal(pendingCount(), 2);
  timer.clear();
  assert.equal(pendingCount(), 0);

  fire(200);
  assert.equal(slowCalls, 0, "callback must not fire after clear()");
});

test("clear() is safe to call before start()", () => {
  const { scheduler } = createFakeScheduler();
  const timer = createColdStartTimer({ scheduler });
  assert.doesNotThrow(() => timer.clear());
});

test("start() called twice resets timers instead of stacking callbacks", () => {
  const { scheduler, fire, pendingCount } = createFakeScheduler();
  let slowCalls = 0;
  const timer = createColdStartTimer({
    onSlow: () => slowCalls++,
    onVerySlow: () => {},
    slowMs: 100,
    verySlowMs: 200,
    scheduler,
  });

  timer.start();
  timer.start();
  assert.equal(pendingCount(), 2, "restarting should not leak the previous timers");

  fire(100);
  assert.equal(slowCalls, 1, "only the latest scheduled callback should fire");
});

test("missing onSlow/onVerySlow callbacks do not throw and schedule nothing", () => {
  const { scheduler, pendingCount } = createFakeScheduler();
  const timer = createColdStartTimer({ scheduler });
  assert.doesNotThrow(() => timer.start());
  assert.equal(pendingCount(), 0);
});

test("defaults slowMs/verySlowMs when not provided", () => {
  const { scheduler, fire } = createFakeScheduler();
  let slowCalls = 0;
  const timer = createColdStartTimer({ onSlow: () => slowCalls++, scheduler });
  timer.start();
  fire(4999);
  assert.equal(slowCalls, 0, "should not fire before the default 5000ms");
  fire(5000);
  assert.equal(slowCalls, 1);
});
