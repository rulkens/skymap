export type RenderSchedulerOptions = {
  /** Called every time a scheduled frame fires. */
  onFrame: () => void;
  /**
   * Called after each `onFrame`: a promise that settles when the GPU has finished
   * that frame's submitted work (`queue.onSubmittedWorkDone()`), or `null` when the
   * frame submitted nothing. The scheduler holds new frames while
   * `MAX_FRAMES_IN_FLIGHT` of these are pending. Omit for an unfenced loop.
   */
  frameWorkDone?: () => Promise<unknown> | null;
  /**
   * rAF implementation. Defaults to the global `requestAnimationFrame`.
   * Tests inject a fake.
   */
  rafImpl?: (cb: FrameRequestCallback) => number;
  /**
   * cAF implementation. Defaults to the global `cancelAnimationFrame`.
   * Tests inject a fake.
   */
  cafImpl?: (id: number) => void;
  /**
   * setTimeout implementation, backing `requestIdleFrame`'s coarse heartbeat.
   * Defaults to the global `setTimeout`. Tests inject a fake to fire the idle
   * tick deterministically. Typed against the return of the global so the
   * matching `clearTimeoutImpl` accepts the same handle in both Node and DOM.
   */
  setTimeoutImpl?: (cb: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  /**
   * clearTimeout implementation. Defaults to the global `clearTimeout`.
   */
  clearTimeoutImpl?: (handle: ReturnType<typeof setTimeout>) => void;
};
