// scalarVolume/io.wesl — what vertex.wesl, fragment.wesl and volumeFieldRenderer.ts agree on: the
// two uniform blocks (the renderer packs them by hand-literal index, volumeUniformsLayout.parity
// pins the offsets) and the varyings. Bindings stay in the stage files: WESL exports no module vars.

import package::lib::camera::CameraUniforms;

struct VolumeUniforms {
  cam: CameraUniforms,
  modelMatrix: mat4x4<f32>,
  invModelMatrix: mat4x4<f32>,
  cameraPosWorld: vec3<f32>,
  intensity: f32,
  densityScale: f32,
  // applyContrastWindow's deadband width, 1 = identity. Intensity is overall opacity; this picks
  // which voxels take part.
  contrast: f32,
  // The window's centre in LUT space: 0.5 for divergent palettes, 0 for sequential (MCPM:
  // 0 = void).
  contrastCenter: f32,
  // sphericalEnvelope edges, in local distance from the centre (inscribed sphere 1, corners √3);
  // both ≥ √3 disables it.
  envelopeInner: f32,
  envelopeOuter: f32,
  // HDR boost on rgb only (more alpha would hide structure), weighted to the palette's extremes.
  exposure: f32,
  // Extra cut in [0, 0.95]: the fraction of what survives the contrast deadband also suppressed.
  trim: f32,
  // The engine frame index, shared by every view of a frame (all dome faces). The CPU wraps it at
  // 1e6, a multiple of the mask's slice count, so it is exact in f32.
  jitterIndex: f32,
  // March steps per ray (an integer, exact in f32).
  steps: f32,
  gain: f32,
  _pad0: f32,
  baseVoxelMpc: f32,
  // The stored box inside the native grid's [0,1]³ (GpuVolume.nativeBox).
  nativeBoxOffset: vec3<f32>,
  nativeBoxScale: vec3<f32>,
};

// The detail region (DetailRegionDraw): boxes in the stored box's local [0,1]³, the texture
// repeat-sampled at local · texScale. vec3 alignment alone places every member (no pad members).
struct RegionUniforms {
  settledLo: vec3<f32>, voxelMpc: f32,
  settledHi: vec3<f32>, fadeW: f32,
  texScale: vec3<f32>,
  intoLo: vec3<f32>,
  intoHi: vec3<f32>,
  outLo: vec3<f32>,
  outHi: vec3<f32>,
};

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) localPos: vec3<f32>,
  @location(1) worldPos: vec3<f32>,
};
