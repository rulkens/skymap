/**
 * BODY_GLINT_INSTANCE_FLOATS — per-glint instance record: position (f32x3) + colour (f32x3) +
 * brightness (f32) = 7 floats, 28 bytes. Must stay byte-exact with the attribute declarations
 * in `bodyGlint/vertex.wesl` (locations 0/1/2 at offsets 0/12/24) — the vertex-stride keep-rule.
 * Data, not the renderer's export, so pure packers can size staging without importing a GPU module.
 */

export const BODY_GLINT_INSTANCE_FLOATS = 7;
