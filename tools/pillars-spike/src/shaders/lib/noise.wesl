// lib/noise.wesl — 3D hash / value-noise / fbm for the nebula bakes.
//
// The runtime raymarcher never calls these: all procedural detail is baked
// once into 3D textures by the generation compute pass, so noise quality
// can be prioritised over per-frame cost. Five-octave fbm over a hashed
// trilinear value-noise lattice is the classic recipe for molecular-cloud
// structure: the low octaves give the large lobes and bays, the high
// octaves the crinkly photo-evaporated skin.
//
// Why value noise rather than gradient (Perlin/simplex) noise: gradient
// noise has better isotropy, but after 5 octaves of domain-warped fbm the
// difference is invisible in a density field, and value noise needs one
// hash per lattice corner instead of one hash plus a gradient dot — ~30%
// cheaper in the bake, which touches ~5.7M voxels × dozens of evals.
//
// hash31 is Dave Hoskins' "Hash without Sine" 3D→1D variant (CC0,
// https://www.shadertoy.com/view/4djSRW) — the same family the runtime
// engine uses for its ray-march jitter (see src/services/gpu/shaders/
// lib/util.wesl's hash21Hq docblock for why sin-based hashes band).

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q = q + dot(q, q.zyx + vec3<f32>(31.32));
  return fract((q.x + q.y) * q.z);
}

// hash21Hq — 2D→1D "Hash without Sine", identical math to the runtime's
// copy. Used for the raymarch start-offset jitter (fragment coords in,
// [0,1) out), where sin-hash banding is visibly objectionable.
fn hash21Hq(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

// valueNoise3 — trilinear interpolation of hashed lattice values with a
// smoothstep fade (Perlin's 3t²-2t³), giving C¹-continuous noise in [0,1].
fn valueNoise3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash31(i + vec3<f32>(0.0, 0.0, 0.0));
  let n100 = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash31(i + vec3<f32>(1.0, 1.0, 1.0));
  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);
  let nxy0 = mix(nx00, nx10, u.y);
  let nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

// fbm3 — 5-octave fractal Brownian motion, output roughly in [0,1].
// Lacunarity 2.02 (not exactly 2) so octave lattices never re-align and
// produce visible axis-aligned ridges; gain 0.5 is the standard 1/f
// spectrum that reads as natural turbulence.
fn fbm3(p_in: vec3<f32>) -> f32 {
  var p = p_in;
  var amp = 0.5;
  var sum = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    sum = sum + amp * valueNoise3(p);
    p = p * 2.02;
    amp = amp * 0.5;
  }
  return sum;
}

// fbm3Vec — three decorrelated fbm channels for domain warping. The fixed
// offsets are arbitrary large constants that put each channel in a distant
// region of the hash lattice, so the warp vector's components don't
// correlate (a correlated warp shears the field diagonally instead of
// swirling it).
fn fbm3Vec(p: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    fbm3(p),
    fbm3(p + vec3<f32>(19.19, 57.31, 7.77)),
    fbm3(p + vec3<f32>(-31.41, 11.13, 43.21)),
  );
}
