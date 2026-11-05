/**
 * markerLineInstanceLayout — the slot-1 per-instance vertex layout feeding
 * `VsIn` locations 1–5 of `shaders/markerLines/io.wesl`. Single-sourced
 * because both `markerLineRenderer` and `debugLineRenderer` bind those
 * shaders: a per-renderer copy drifted once (locations 4–5 missing) and
 * failed pipeline validation only on a real device.
 *
 * 3 × vec4 + two scalars = 56 bytes; a vertex stride only has to be a multiple
 * of 4, so the scalars ride alone rather than costing a padded vec4.
 */
export const MARKER_LINE_INSTANCE_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 56,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 1, offset: 0, format: 'float32x4' }, // fromWorld.xyz, pixelWidth
    { shaderLocation: 2, offset: 16, format: 'float32x4' }, // toWorld.xyz, fadeAlpha
    { shaderLocation: 3, offset: 32, format: 'float32x4' }, // premultiplied rgba
    { shaderLocation: 4, offset: 48, format: 'float32' }, // occludeWeight
    { shaderLocation: 5, offset: 52, format: 'float32' }, // occludeNearKm
  ],
};
