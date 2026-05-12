/**
 * Per-instance data for the textured galaxy-thumbnail pass.
 *
 * Layout (must match WESL `struct InstanceIn` in
 * `shaders/thumbnails/io.wesl` and the JS-side `Float32Array` write
 * pattern in `TexturedQuadRenderer.draw`):
 *
 *   pos:    vec3<f32>  // world-space center, Mpc
 *   sizeW:  f32        // world-space quad side length, Mpc
 *   uvRect: vec4<f32>  // [u0, v0, u1, v1] within the atlas
 *   extras: vec4<f32>  // [fadeAlpha, _, _, _]
 *
 * Total: 12 floats = 48 bytes per instance.  Three vec4 chunks, all
 * naturally 16-byte aligned for WGSL std140-ish vertex-buffer attribute
 * alignment.
 *
 * `fadeAlpha` ∈ [0, 1] is the engine's per-frame fade multiplier — a
 * combination of (a) distance fade (smoothstep across an 8 px band
 * above the apparent-size fetch threshold so thumbnails ramp in as
 * galaxies grow on screen) and (b) load fade (smoothstep over ~400 ms
 * from the moment a bitmap lands in the atlas, so freshly-fetched
 * thumbnails don't pop in).  The shader multiplies its computed alpha
 * by this value before output.
 */
export type ThumbnailInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  fadeAlpha: number;
};
