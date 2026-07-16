export type RenderScheduler = {
  /**
   * Mark the scene dirty and ensure exactly one rAF is queued. Subsequent
   * calls before the frame fires are coalesced into the existing token.
   *
   * Idempotent within a single frame — call as many times as you like
   * from event handlers; only one frame will fire.
   *
   * `reason` is an optional caller tag (e.g. `'runFrame:shouldKeepTicking'`)
   * used only by the dev-only wake-probe diagnostic below — production
   * callers may omit it. TODO(wake-probe): remove after T13.
   */
  requestRender(reason?: string): void;
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
  /**
   * TEMPORARY bring-up probe (TODO(wake-probe): remove after T13). Dev-only
   * snapshot of per-`reason` `requestRender()` call counts accumulated since
   * the current rAF tick began; empty in production builds. Optional so
   * lightweight test doubles that only stub `requestRender` still satisfy
   * this type — callers use `?.()`.
   */
  getRequestReasonCounts?(): ReadonlyMap<string, number>;
};
