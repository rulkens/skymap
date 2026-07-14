/**
 * unitQuad — the shared unit-quad corners (triangle-strip order) and their
 * matching slot-0 vertex-buffer layout, used by every instanced-quad pass that
 * expands one instance into a screen-aligned quad.
 *
 * ## Why one definition instead of a per-renderer copy
 *
 * `debugLineRenderer`, `labelRenderer`, `markerLineRenderer`, and
 * `filamentRenderer` each carried a byte-identical
 * `new Float32Array([0,0,1,0,0,1,1,1])` plus a byte-identical
 * `{ arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0,
 * offset: 0, format: 'float32x2' }] }` layout literal in their pipeline
 * descriptors.  Four copies of the same four corners and the same eight-byte
 * stride are four chances for a silent drift — flip a corner or the format and
 * the affected pass renders garbage while the others stay correct, which reads
 * as "only one pass is broken" rather than pointing at the shared geometry.
 * Pulling the data and its layout into one module makes the unit-quad contract
 * single-sourced, the same way `lib/cameraUniforms.ts` single-sources the
 * camera prefix.
 *
 * Draw topology stays per-renderer: the three overlay passes draw the four
 * corners directly as a triangle-strip, while filaments walks the same corners
 * through its own index buffer (two triangles, `[0,1,2,1,3,2]`).  The corner
 * DATA and the slot-0 layout are the shared contract; how a pipeline walks the
 * corners is not.
 *
 * ## Why the corners live here and not in the shaders
 *
 * The alternative was to drop the corner buffer entirely and generate the four
 * (x,y) corners from `@builtin(vertex_index)` inside each vertex shader.  That
 * works, but the consuming shaders already read the corner from location 0 and
 * the CPU side already uploads a tiny static buffer once at construction — a
 * per-frame-free cost.  Keeping the geometry on the CPU keeps the shaders
 * uniform (every consuming vertex stage reads `corner`/`uv` from location 0)
 * and lets the layout literal be shared alongside the data it describes.
 *
 * ## What this deliberately does NOT cover
 *
 * `milkyWayCloudRenderer`'s `CORNER_QUAD` is intentionally NOT this quad: it is
 * a six-vertex triangle-LIST in NDC `[-1, 1]` space (billboard corners pushed
 * along camRight/camUp), a different topology and coordinate space than these
 * `[0, 1]` corners.  It is a genuinely different primitive, not another copy
 * to fold in.
 *
 * (This file exports a data const AND its layout — the one-symbol-per-file rule
 * is a `utils/` and `@types/` rule; `renderers/lib/` modules group one
 * geometry's constants together, like `lib/cameraUniforms.ts` groups the byte
 * size with its writer.)
 *
 * @module
 */

/**
 * Four (x,y) corners of the unit quad in triangle-strip order:
 *   (0,0), (1,0), (0,1), (1,1)
 * Broadcast across all instances via `stepMode: 'vertex'`; each consumer's
 * vertex stage expands a corner into a screen-space position relative to its
 * per-instance data (glyph pen box, line endpoints, filament segment, ...).
 * 32 bytes total (4 × 2 × f32) — read `.byteLength` at the call site to size
 * the buffer.
 */
export const UNIT_QUAD_STRIP_CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

/**
 * Slot-0 vertex-buffer layout for `UNIT_QUAD_STRIP_CORNERS`: one `float32x2`
 * at `shaderLocation: 0`, stride 8, stepped per vertex so the four corners
 * broadcast across every instance in slot 1.
 */
export const UNIT_QUAD_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 8,
  stepMode: 'vertex',
  attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
};
