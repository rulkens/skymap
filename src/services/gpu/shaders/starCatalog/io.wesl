// starCatalog/io.wesl — byte-layout contract for the survey-star pipeline's
// structs (vertex.wesl, fragment.wesl, pickFragment.wesl); the StarUniforms
// table below is the source of truth for starCatalogLayout.ts.
//
// StarUniforms (@group(0)), std140; the renderer's camera write must stay
// byte-exact with it:
//   offset   0  cam                    CameraUniforms (80 B)
//   offset  80  sizePx                 f32  user base dot size, px
//   offset  84  brightness             f32  user exposure trim; 1.0 = identity
//   offset  88  glowOverlap            f32  aggregate glow spread; 1.0 = identity
//   offset  92  pickPass               u32  0 = visual, 1 = pick
//   offset  96  aggregateIntensityCap  f32  peak ceiling for aggregates
//   offset 100  pxPerRad               f32  target px per radian, for toRefPx
//   offset 112  focusCenterRelCam      vec3<f32>  focus centre - camera, Mpc (align 16)
//   offset 124  focusApparentRadiusMpc f32  rides the vec3's 4th lane
//   offset 128  focusPhysicalRadiusMpc f32
//   offset 132  focusBlend             f32  0 = no focus; the multiplier is 1
//   size 144 (rounded to the prefix's 16 B alignment; 104..111 and 136..143 pad)
//
// pickPass is written only by the pick pipeline, into its OWN uniform buffer;
// the visual draw leaves it zero-init. One flag rather than a second vertex
// module keeps both pipelines on one vertex stage. The pick draw is leaf-only,
// so it leaves aggregateIntensityCap and pxPerRad zero.

import package::lib::camera::CameraUniforms;

struct StarUniforms {
  cam: CameraUniforms,
  sizePx: f32,
  brightness: f32,
  glowOverlap: f32,
  pickPass: u32,
  aggregateIntensityCap: f32,
  pxPerRad: f32,
  // Subtracted from the camera in f64 on the CPU, so the shader never has to.
  focusCenterRelCam: vec3<f32>,
  focusApparentRadiusMpc: f32,
  focusPhysicalRadiusMpc: f32,
  focusBlend: f32,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Corner in circumscribing-triangle space; the unit disc is inscribed, so r2 > 1 is discarded.
  @location(0) uv: vec2<f32>,
  // Linear-RGB spectral tint.
  @location(1) color: vec3<f32>,
  // Source crossfade alpha.
  @location(2) opacity: f32,
  // Peak intensity, scaled so a record's integrated luminance follows its flux
  // (vertex.wesl derives it).
  @location(3) intensity: f32,
  // Bin-global record index; the pick fragment packs it, 'resolveStarRecord' inverts it.
  @location(4) @interpolate(flat) recordIdx: u32,
};
