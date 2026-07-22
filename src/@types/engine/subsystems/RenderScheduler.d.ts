export type RenderScheduler = {
  /**
   * Mark the scene dirty and ensure exactly one rAF is queued. Subsequent
   * calls before the frame fires are coalesced into the existing token.
   *
   * Idempotent within a single frame — call as many times as you like
   * from event handlers; only one frame will fire.
   */
  requestRender(): void;
  /**
   * Arm a one-shot coarse "wake me in `delayMs`" timer, then let the loop
   * sleep. When the timer fires it calls `requestRender` once; the frame body
   * re-arms it while it still wants a slow heartbeat. This is the render-on-
   * demand-friendly alternative to a free-running `setInterval`: a single
   * pending timer at a time (re-arming while one is live is a no-op), and it
   * is IGNORED while the loop is already awake (a rAF frame queued) so it never
   * fights the 60 fps path. Used for the live sim clock, whose real-time
   * advance would otherwise pin the loop just to nudge the terminator.
   */
  requestIdleFrame(delayMs: number): void;
  /**
   * Cancel a queued frame (if any) and reset to "idle". Used by the
   * engine's `destroy()` to avoid a final post-teardown frame firing
   * after GPU resources have been released.
   *
   * Renamed from `cancelRender()` so the scheduler satisfies the
   * shared `Destroyable` shape every subsystem now exposes.
   */
  destroy(): void;
  /**
   * `true` when a frame is queued and pending; `false` when the loop is
   * idle. Mostly for tests; also useful for assertions in DevTools.
   */
  isScheduled(): boolean;
};
