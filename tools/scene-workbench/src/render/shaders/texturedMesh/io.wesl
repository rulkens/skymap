// texturedMesh/io.wesl — the mesh pass's varyings and its preview-mask layout.
// uvs arrive exactly as glTF stores them — origin top-left, matching WebGPU's
// texture space, so 'uploadTexturedMesh' uploads with flipY: false (the
// inverse of the whole-globe uploads in docs/RENDERER.md).

// Preview mask, mesh-local metres; packMaskPolygon.ts writes it. count < 3 means no mask.
struct MaskPolygon {
  count: u32,
  _pad: u32,
  cornersM: array<vec2f>,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) localXY: vec2<f32>,
};
