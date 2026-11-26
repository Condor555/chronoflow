import test from "node:test";
import assert from "node:assert/strict";
import { createLiveClock } from "../src/live-clock.mjs";

test("il clock Home mantiene un solo timer e aggiorna subito", () => {
  let ticks = 0;
  let nextId = 0;
  const active = new Set();
  const clock = createLiveClock({
    tick: () => { ticks += 1; },
    setIntervalFn: () => { const id = ++nextId; active.add(id); return id; },
    clearIntervalFn: (id) => active.delete(id)
  });
  clock.start();
  clock.start();
  assert.equal(ticks, 2);
  assert.equal(active.size, 1);
  assert.equal(clock.running, true);
  clock.stop();
  assert.equal(active.size, 0);
  assert.equal(clock.running, false);
});

test("resume dopo background ricalcola immediatamente e non duplica il timer", () => {
  let ticks = 0;
  let nextId = 0;
  const active = new Set();
  const clock = createLiveClock({
    tick: () => { ticks += 1; },
    setIntervalFn: () => { const id = ++nextId; active.add(id); return id; },
    clearIntervalFn: (id) => active.delete(id)
  });
  clock.start();
  clock.stop();
  clock.resume();
  clock.resume();
  assert.equal(ticks, 3);
  assert.equal(active.size, 1);
});
