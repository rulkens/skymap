// lib/scene.wesl — the two uniform structs shared by every draw stage.
//
// ## SceneUniforms — per-frame camera + art-direction knobs
//
// Byte layout is mirrored by tools/pillars-spike/src/engine/
// packSceneUniforms.ts, and tests/tools/pillars-spike/engine/
// packSceneUniforms.test.ts asserts the offsets. If you add or reorder a
// field here, update the packer and its test in the same change — a silent
// mismatch renders garbage without any validation error, which is the
// most time-expensive bug class in WebGPU.
//
// The camera basis (right/up/fwd + tanHalfFov + aspect) exists so
// FULLSCREEN passes can reconstruct the per-pixel world ray without an
// inverse view-projection multiply:
//   dir = normalize(fwd + ndc.x·tanHalfFov·aspect·right + ndc.y·tanHalfFov·up)
// The background pass and the nebula raymarcher must generate IDENTICAL
// rays for a given pixel (the nebula fragment re-composites the background
// behind the volume — see nebula.wesl's header), and deriving both from
// the same basis vectors guarantees that by construction.

struct SceneUniforms {
  viewProj: mat4x4<f32>,      // bytes   0..63
  camPos: vec3<f32>,          // bytes  64..75
  timeSec: f32,               // bytes  76..79  seconds since boot (drift/shimmer)
  camRight: vec3<f32>,        // bytes  80..91
  tanHalfFov: f32,            // bytes  92..95
  camUp: vec3<f32>,           // bytes  96..107
  aspect: f32,                // bytes 108..111 width / height
  camFwd: vec3<f32>,          // bytes 112..123
  frame: f32,                 // bytes 124..127 frame counter (jitter decorrelation)
  densityMul: f32,            // bytes 128..131 dust optical-depth multiplier
  emissionMul: f32,           // bytes 132..135 ionization-front emission strength
  scatterMul: f32,            // bytes 136..139 starlight in-scatter strength
  ambientMul: f32,            // bytes 140..143 sky/ambient fill strength
  starBrightness: f32,        // bytes 144..147 billboard star intensity multiplier
  phaseG: f32,                // bytes 148..151 Henyey-Greenstein forward anisotropy
  detailErosion: f32,         // bytes 152..155 detail-noise erosion strength [0,1]
  detailScale: f32,           // bytes 156..159 detail texture cycles per world unit
}

// ## LightStars — the ionizing sources, written once at boot
//
// Exactly LIGHT_STAR_COUNT stars drive the lighting (bake + runtime
// in-scatter). Their data is a uniform rather than shader constants so the
// TS side (star billboards, cluster placement) and the GPU side share ONE
// source of truth: tools/pillars-spike/src/data/lightStars.ts. The uniform
// is packed by packLightStarsUniform.ts (offset-tested, same policy as
// SceneUniforms).
//
//   posPower[i]  = xyz world position, w = luminous power (HDR, unbounded)
//   colorUv[i]   = rgb linear colour,  w = ionizing-flux strength (drives
//                  the emission term, separate from the visible power so a
//                  hot O-star can ionize harder than it visually glows)

const LIGHT_STAR_COUNT = 3;

struct LightStars {
  posPower: array<vec4<f32>, 3>,
  colorUv: array<vec4<f32>, 3>,
}
