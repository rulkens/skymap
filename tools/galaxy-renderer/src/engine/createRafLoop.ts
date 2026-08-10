/**
 * createRafLoop — "keep calling this every frame until stopped", separated
 * from what a frame does.
 *
 * The `running` flag is not redundant with `cancelAnimationFrame`: the callback
 * may already be in flight when `stop` lands, and the flag is what keeps that
 * last tick from rescheduling itself.
 */

export function createRafLoop(onFrame: (nowMs: number) => void): {
  start(): void;
  stop(): void;
} {
  let raf = 0;
  let running = false;

  const tick = (nowMs: number): void => {
    if (!running) return;
    onFrame(nowMs);
    raf = requestAnimationFrame(tick);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
