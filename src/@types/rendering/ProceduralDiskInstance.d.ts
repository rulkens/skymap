/**
 * ProceduralDiskInstance — one entry in the procedural-disk pass's
 * per-instance vertex buffer.  Mirrors the texture-based `DiskInstance`
 * (see `src/services/gpu/diskRenderer.ts`) but drops the atlas UV rect
 * — the procedural fragment shader doesn't sample any texture.
 *
 * Each instance describes one galaxy as a 3D-oriented quad in world
 * space:
 *
 *   - `(x, y, z)` is the galaxy's world-space centre in Mpc, identical
 *     to the position used by the points pass and the textured-disk pass.
 *   - `sizeWorldMpc` is the FULL extent of the impostor quad in Mpc (i.e.
 *     the diameter of the rendered quad along its major axis).  This
 *     matches `DiskInstance.sizeWorld` for the textured-thumbnail pass —
 *     the emission site sets the same value for both renderers, and each
 *     shader halves it internally to place the corner vertices.  The
 *     value is `(diameterKpc/1000) * 4` per the convention shared with
 *     `points.wgsl`'s `GALAXY_RADIUS_MPC` formula.
 *   - `axisRatio` is `b/a` ∈ (0.05, 1].  The vertex shader uses it to
 *     foreshorten one of the in-plane axes so the projected disk
 *     appears at the catalogued inclination.
 *   - `positionAngleDeg` is the east-of-north position angle of the
 *     major axis in degrees, [0, 180).  Same convention the texture-
 *     based disk uses.
 *   - `colourIndex` is the per-row colour-index value (already
 *     normalised 0..2 by the engine — same scalar that drives the
 *     points-pass colour ramp).
 *   - `crossfadeAlpha` is the [0, 1] fade-in coefficient computed by
 *     the engine each frame from `apparentSizePx`: 0 below 8 px, 1
 *     above 14 px, smoothstep in between.  The fragment shader
 *     multiplies the final RGBA by this so the disk fades in as the
 *     point fades out.
 *
 * Layout: 12 floats = 48 bytes per instance; the orientation / extras
 * vec4 each have 2 trailing padding f32 to keep WGSL's 16-byte alignment
 * for instance attributes.  WGSL `@location` attributes step in vec4
 * quanta even when the underlying record uses fewer fields, so packing
 * the eight semantic floats above into three `float32x4` slots costs
 * four padding floats but lets us declare the vertex layout cleanly as
 * `[float32x4, float32x4, float32x4]`.  Vertex buffer stride is
 * therefore 48 bytes; the renderer's pipeline descriptor declares
 * `stepMode: 'instance'` so each draw-call vertex sees the same record
 * for all six corner vertices.
 */
export type ProceduralDiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorldMpc: number;
  axisRatio: number;
  positionAngleDeg: number;
  colourIndex: number;
  crossfadeAlpha: number;
};
