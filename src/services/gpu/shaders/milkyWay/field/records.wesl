// records.wesl — the analytic field's per-component record: SSoT for
// io.wesl's 'comps' storage array, mirrored (not authored) by
// packFieldComponents and checked by records.parity.test.ts. Each vec3's
// own 16-byte alignment packs the scalar right after it, so this is exactly
// four vec4s of bytes, not a relayout.

struct FieldComponentRec {
  invCovDiagonal: vec3<f32>,
  amplitude: f32,
  invCovOffDiagonal: vec3<f32>,
  boundRadius: f32,
  color: vec3<f32>,
  textureWeight: f32,
  center: vec3<f32>,
  starsWeight: f32,
}
