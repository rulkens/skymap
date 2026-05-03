/**
 * Per-instance data for the textured-quad pass.
 *
 * Layout (must match WGSL `struct InstanceIn` and the JS-side
 * `Float32Array` write pattern in `QuadRenderer.draw`):
 *
 *   pos:   vec3<f32>  // world-space center, Mpc
 *   sizeW: f32        // world-space quad side length, Mpc
 *   uvRect:vec4<f32>  // [u0, v0, u1, v1] within the atlas
 *
 * Total: 8 floats = 32 bytes per instance.  Two vec4 chunks (vec3+f32
 * and vec4) — both naturally 16-byte aligned, matching WGSL std140-ish
 * alignment for vertex-buffer instance attributes.
 */
export type QuadInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};
