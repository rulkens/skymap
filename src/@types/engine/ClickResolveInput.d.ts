import type { PickSourceDraw } from '../rendering/PickSourceDraw';

export type ClickResolveInput = {
  /** Click X coordinate in *texture-space* pixels (CSS × capped DPR). */
  pickXPx: number;
  /** Click Y coordinate in *texture-space* pixels (CSS × capped DPR). */
  pickYPx: number;
  /** Physical canvas size `[width, height]` in backing-store pixels. */
  viewportPx: [number, number];
  /** Visible per-source draw records — same shape pickRenderer.pick wants. */
  visibleSources: Iterable<PickSourceDraw>;
  /**
   * The user's current `pointSizePx` setting.  Forwarded to
   * `pickRenderer.pick` so it can boost the picking floor (see
   * `PICK_PADDING_PX` in pickRenderer.ts) — distant point-like
   * galaxies get a wider hit-test area, making them easier to click.
   * Optional so legacy callers that don't yet thread the setting
   * through can still construct a ClickResolveInput.
   */
  pointSizePx?: number;
};
