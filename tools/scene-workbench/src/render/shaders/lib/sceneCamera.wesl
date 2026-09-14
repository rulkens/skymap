// lib/sceneCamera.wesl — the group-0 uniform every scene-workbench pass binds.
// Mirrored byte-for-byte by 'writeSceneCamera.ts' and pinned by
// 'sceneCamera.parity.test.ts'; the writer carries the field-by-field rationale.

struct SceneCamera {
  viewProj: mat4x4<f32>,
  rightM: vec3<f32>,
  pointSizePx: f32,
  upM: vec3<f32>,
  viewportH: f32,
  eyeM: vec3<f32>,
  metresPerPx: f32,
  view: mat4x4<f32>,
  splatScale: f32,
  opacityScale: f32,
  // Split from its 'viewportH' twin on purpose: here it fills the struct's
  // 4-byte tail hole, whereas beside 'viewportH' it pushes 'view' past 192.
  viewportW: f32,
};
