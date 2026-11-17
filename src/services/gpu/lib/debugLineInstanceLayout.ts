/**
 * debugLineInstanceLayout — the slot-1 per-instance vertex layout feeding
 * `VsIn` locations 1–3 of `shaders/debugLines/io.wesl`; a missing location
 * fails pipeline validation only on a real device (`debugLineRenderer.test`).
 */
export const DEBUG_LINE_INSTANCE_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 48,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 1, offset: 0, format: 'float32x4' }, // from.xyz, pixelWidth
    { shaderLocation: 2, offset: 16, format: 'float32x4' }, // to.xyz, fadeAlpha
    { shaderLocation: 3, offset: 32, format: 'float32x4' }, // premultiplied rgba
  ],
};
