/**
 * LodSettings — camera-dependent visibility and culling thresholds. Separated
 * from RenderSettings to mirror the GPU boundary: these feed the camera UBO,
 * whereas compositing knobs feed the composite UBO.
 */

export type LodSettings = {
  readonly lodApparent: number; // min on-screen size before flux-conserving fade; 0 = off
  readonly cullBright: number; // hard cull of stars fainter than this; 0 = off
};
