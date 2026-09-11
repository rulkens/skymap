/**
 * The narrow display contract `render/` owns: the draw-time knobs a renderer
 * actually reads, which is the route for a knob that switches a PIPELINE where
 * the sliders ride the camera uniform instead. `viewSlice`'s `display` is wider
 * and satisfies this structurally, so it can grow knobs without touching here.
 */
export type SceneDisplay = {
  readonly mesh: { readonly wireframe: boolean };
};
