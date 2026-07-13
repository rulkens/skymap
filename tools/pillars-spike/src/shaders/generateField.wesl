// generateField.wesl — one-time compute bake of the nebula's 3D field.
//
// Output texel (rgba8unorm, one texel per voxel):
//   r  dust density        [0,1]  — the opaque molecular columns
//   g  emissive-gas density [0,1] — the thin ionized haze filling the region
//   b  temperature/mix noise      — tints dust + blends Hα vs [OIII] emission
//   a  fine detail noise          — modulates rim emission graininess
//
// ## Why bake instead of evaluating noise in the raymarcher
//
// The runtime marcher takes ~100+ samples per pixel per frame; a 5-octave
// domain-warped fbm at each sample would cost ~50 hash-lattice evals per
// step — two orders of magnitude over budget at 1440p. Baking moves ALL
// noise cost to a one-time compute pass (~milliseconds) and turns each
// runtime sample into a single trilinear texture fetch. The trade is
// memory (a 160×224×160 rgba8 volume is ~23 MB) and a fixed resolution —
// the 8-bit density quantisation is invisible after the transfer curves,
// and hardware trilinear smooths the lattice.
//
// ## The shape recipe (how the pillars are sculpted)
//
// 1. Three capped-cone SDF columns lean out of a common base mound —
//    positions/heights eyeballed against the M16 Hubble frame (tallest
//    column left, two shorter to its right).
// 2. The evaluation point is DOMAIN-WARPED by a vector fbm before the SDF:
//    warping the space (not the surface) turns clean cones into gnarled,
//    undercut columns — the standard trick for sculpted volumetrics.
//    Warp is weaker along y so the columns stay coherent vertically.
// 3. A second fbm is FOLDED INTO the SDF threshold (surface erosion),
//    which eats wispy bays into the silhouette — the photo-evaporated
//    look — instead of just displacing it.
// 4. Interior density is modulated by a third fbm so lit faces show
//    internal clumping rather than a flat wall.
// 5. Everything fades to zero near the volume boundary (edgeEnvelope) so
//    the bounding box never shows as a clipped slab.

import package::lib::noise::fbm3;
import package::lib::noise::fbm3Vec;
import package::lib::volume::VOLUME_MIN;
import package::lib::volume::VOLUME_MAX;

struct GenUniforms {
  // Seed offset shifts every noise domain, giving a whole new cloud from
  // the same pillar skeleton. Driven by the '↻ new cloud' button.
  seed: vec3<f32>,
  // First z-voxel of this dispatch's slab. Generation is dispatched in
  // z-slab submits exactly like the light bake — a single full-grid
  // dispatch is seconds of work on software WebGPU implementations
  // (SwiftShader), which kills the device with a watchdog timeout.
  zBase: u32,
}

@group(0) @binding(0) var<uniform> gen: GenUniforms;
@group(0) @binding(1) var outField: texture_storage_3d<rgba8unorm, write>;

// Capped-cone column SDF: distance to the base→tip segment minus a radius
// profile that tapers toward the tip and swells into the characteristic
// knobby head just below it (the dense "evaporating gaseous globule" cap
// that shields the column below — the reason pillars exist at all).
fn sdPillar(q: vec3<f32>, base: vec3<f32>, tip: vec3<f32>, rBase: f32) -> f32 {
  let pa = q - base;
  let ba = tip - base;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  let taper = 1.0 - 0.62 * pow(h, 1.4);
  let head = 0.34 * smoothstep(0.74, 0.96, h) * (1.0 - smoothstep(0.96, 1.0, h) * 0.7);
  let r = rBase * (taper + head);
  return length(pa - ba * h) - r;
}

// Soft fade to zero within 'margin' (in [0,1] uv units) of every box face,
// so no density is ever clipped by the volume bounds.
fn edgeEnvelope(uv: vec3<f32>) -> f32 {
  // Vector smoothstep needs vector edges (WGSL has no scalar-edge,
  // vector-x overload).
  let zero = vec3<f32>(0.0);
  let m = vec3<f32>(0.06);
  let lo = smoothstep(zero, m, uv);
  let hi = smoothstep(zero, m, vec3<f32>(1.0) - uv);
  return lo.x * lo.y * lo.z * hi.x * hi.y * hi.z;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid_in: vec3<u32>) {
  let gid = vec3<u32>(gid_in.x, gid_in.y, gid_in.z + gen.zBase);
  let dims = textureDimensions(outField);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) {
    return;
  }
  let uv = (vec3<f32>(gid) + vec3<f32>(0.5)) / vec3<f32>(dims);
  let q = mix(VOLUME_MIN, VOLUME_MAX, uv);

  // (2) domain warp — weaker in y to preserve column coherence.
  let warp = (fbm3Vec(q * 1.7 + gen.seed) - vec3<f32>(0.5)) * vec3<f32>(0.46, 0.24, 0.46);
  let qw = q + warp;

  // (1) the three columns + the base mound they rise from.
  let d0 = sdPillar(qw, vec3<f32>(-0.62, -1.55, 0.08), vec3<f32>(-0.30, 1.02, -0.10), 0.40);
  let d1 = sdPillar(qw, vec3<f32>(0.10, -1.55, -0.24), vec3<f32>(0.34, 0.40, -0.16), 0.30);
  let d2 = sdPillar(qw, vec3<f32>(0.62, -1.55, 0.16), vec3<f32>(0.80, 0.02, 0.30), 0.22);
  let mound = qw.y + 1.46 - 0.34 * fbm3(vec3<f32>(q.x, 0.0, q.z) * 1.35 + gen.seed);
  var sd = min(min(d0, d1), min(d2, mound));

  // (3) surface erosion folded into the threshold.
  let erosion = fbm3(qw * 4.2 + gen.seed * 1.3) - 0.5;
  sd = sd + erosion * 0.19;

  // Density transfer: a narrow smoothstep across the (noisy) zero level
  // set. The negative inner edge gives the columns a solid core rather
  // than a hollow shell.
  var dust = smoothstep(0.05, -0.16, sd);
  // (4) internal clumping — lit faces show structure, not a flat wall.
  dust = dust * (0.42 + 0.58 * fbm3(qw * 6.5 + vec3<f32>(3.7) + gen.seed));

  // Emissive-gas haze: fills the cavity ABOVE and AROUND the columns
  // (where the ionizing cluster has already cleared the dust), thins with
  // depth below, and is excluded from dense dust (gas inside a column is
  // neutral — it can't glow).
  var gas = (0.35 + 0.65 * fbm3(q * 1.4 + vec3<f32>(11.0) + gen.seed))
    * smoothstep(-1.5, 1.2, q.y);
  gas = gas * (1.0 - 0.85 * dust) * 0.5;

  // Spherical envelope for the HAZE: without it the gas fills the box
  // uniformly and its glow paints the bounding box as a bright rectangle
  // (verified in the first smoke render). A radial fade in box-normalised
  // coordinates makes the haze a blob that never touches a face. Dust
  // gets a gentler version — its shape is already the pillars', it only
  // needs corner protection.
  let rNorm = length((q - vec3<f32>(0.0, -0.2, 0.0)) / vec3<f32>(1.2, 1.6, 1.2));
  gas = gas * (1.0 - smoothstep(0.55, 0.95, rNorm));
  dust = dust * (1.0 - smoothstep(0.80, 1.05, rNorm));

  let env = edgeEnvelope(uv);
  dust = dust * env;
  gas = gas * env;

  let temp = fbm3(q * 2.3 + vec3<f32>(23.0) + gen.seed);
  let detail = fbm3(qw * 10.0 + gen.seed);
  textureStore(outField, vec3<i32>(gid), vec4<f32>(dust, gas, temp, detail));
}
