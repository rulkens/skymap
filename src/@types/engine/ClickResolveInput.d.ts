/**
 * ClickResolveInput — the pixel coordinate a click resolves at.
 *
 * The click resolver hands this straight to `pickProgram.pick`, which derives
 * everything else — the pick-time camera, the pickable layers, the viewport,
 * the point size, the timing slot — internally from the shared `EngineState`
 * and the content-layer registry. So the only thing a caller must supply is
 * WHERE the cursor is; the pick program owns WHAT is pickable and HOW it is
 * drawn.
 */
export type ClickResolveInput = {
  /** Click X coordinate in *texture-space* pixels (CSS × capped DPR). */
  pickXPx: number;
  /** Click Y coordinate in *texture-space* pixels (CSS × capped DPR). */
  pickYPx: number;
};
