/**
 * Draw-time display knobs, keyed by asset kind: the route for a knob that
 * switches a PIPELINE, where the sliders ride the camera uniform instead.
 * `viewSlice`'s `display` is wider and satisfies this structurally.
 */
export type SceneDisplay = {
  readonly mesh: { readonly wireframe: boolean };
};
