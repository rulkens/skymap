// outlineOverlay/io.wesl — the handle quad's varyings. The pipelines test depth
// 'always', so the ring shows whatever mesh lies above its Z.

struct HandleOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) colour: vec4<f32>,
};
