/**
 * throttleByTime — a stateful gate that returns `true` at most once per
 * `minIntervalMs`, keyed on a caller-supplied `nowMs` timestamp.
 *
 * The engine's per-frame loop wants to publish derived observable state (the
 * sim-clock instant, the focused body's live distance) to the Redux store so
 * React can render it — but dispatching every frame would re-render the TimeBar
 * and InfoCard at the render loop's rate (tens of Hz) for a value humans read a
 * few times a second. This gate lets `runFrame` guard that dispatch:
 *
 *     const publishGate = throttleByTime(250);
 *     // ...each frame:
 *     if (publishGate(nowMs)) store.dispatch(engineTimeReported(report));
 *
 * so the store updates a few Hz regardless of frame rate.
 *
 * Crucially it NEVER reads a wall clock itself — the caller passes `nowMs`
 * (`performance.now()`), the same discipline the sim clock uses to stay a pure
 * function of intent. That makes the gate deterministic and unit-testable with a
 * hand-driven `nowMs` sequence, no fake timers.
 *
 * Semantics: the first call always passes (nothing has fired yet). Thereafter a
 * call passes only once `nowMs` has advanced at least `minIntervalMs` past the
 * last passing call. The interval is measured from the last time the gate
 * OPENED, not from the last call — a burst of sub-interval calls does not push
 * the next opening further out.
 */

export function throttleByTime(minIntervalMs: number): (nowMs: number) => boolean {
  // Null until the gate first opens, so the very first call always passes
  // without needing a sentinel timestamp that could collide with `nowMs === 0`.
  let lastOpenedMs: number | null = null;
  return (nowMs: number): boolean => {
    if (lastOpenedMs === null || nowMs - lastOpenedMs >= minIntervalMs) {
      lastOpenedMs = nowMs;
      return true;
    }
    return false;
  };
}
