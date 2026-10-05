// meshWireframe/fragment.wesl — the edge colour, straight to the non-sRGB swapchain
// like its siblings. 'openEdge' is the pipeline-overridable class switch: one module,
// two pipelines, so the two edge classes cannot drift apart in anything but colour.

override openEdge: f32 = 0.0;

@fragment
fn fs() -> @location(0) vec4<f32> {
  return mix(vec4<f32>(0.55, 0.9, 1.0, 1.0), vec4<f32>(1.0, 0.45, 0.2, 1.0), openEdge);
}
