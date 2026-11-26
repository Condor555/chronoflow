export function createLiveClock({
  tick,
  intervalMs = 1000,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval
} = {}) {
  if (typeof tick !== "function") throw new TypeError("tick deve essere una funzione");
  let timer = null;

  function stop() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function start({ immediate = true } = {}) {
    stop();
    if (immediate) tick();
    timer = setIntervalFn(tick, intervalMs);
    return timer;
  }

  function resume() {
    return start({ immediate: true });
  }

  return {
    start,
    stop,
    resume,
    get running() { return timer !== null; }
  };
}
