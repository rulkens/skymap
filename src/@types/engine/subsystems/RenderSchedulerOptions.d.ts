export type RenderSchedulerOptions = {
  /** Called every time a scheduled frame fires. */
  onFrame: () => void;
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
};
