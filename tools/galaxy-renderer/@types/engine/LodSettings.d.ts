/**
 * LodSettings — the camera-dependent visibility threshold. Separated from
 * RenderSettings to mirror the GPU boundary: this feeds the cloud's uniform
 * struct as a view-dependent LOD, whereas compositing knobs feed the post
 * chain.
 *
 * One field, deliberately. The bag also carried a `cullBright` hard brightness
 * floor for as long as the tool ran its own star shader; the shared
 * `milkyWay/sprites/stars.wesl` has no such lever (the app's Milky Way tuning
 * culls only through the flux-conserving LOD), and a slider that moves nothing
 * is worse in a parity instrument than no slider at all.
 */

export type LodSettings = {
  readonly lodApparent: number; // min on-screen size before flux-conserving fade; 0 = off
};
