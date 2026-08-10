// milkyWay/field/starGrainBake.wesl — one-shot compute bake of the 128^3
// star-grain volume hiiSplat/youngFragment.wesl's (and extrasFragment.wesl's
// association branch) samples for its "thousands of unresolved stars" look
// (see starGrainTerm in hiiSplat/starGrain.wesl).
//
// Deliberately NOT dustNoiseBake.wesl's ridged fbm: that field is a smooth,
// spatially CORRELATED lattice (each octave's value at one point predicts
// its neighbours' — correct for wispy, continuous ISM, wrong for a star
// field where one star's brightness says nothing about the next). This
// bakes discrete point features instead: each cell of a jittered lattice
// owns exactly one point, at its own independent position and its own
// independent (heavy-tailed) brightness, so no two points share any
// structure.
//
// HEAVY-TAILED, log-normal amplitude: exp(mu + sigma*z) with z a
// Box-Muller Gaussian off the SAME cell's hash the point's own position
// comes from (disjoint salts, so position and brightness don't covary). A
// few points land bright, most land faint — "a few grains sparkle above
// many faint ones," not a uniform dusting.
//
// TILEABLE the same way dustNoiseBake.wesl is: a point's BRIGHTNESS/POSITION
// hash keys off its cell wrapped modulo CELLS, while the DISTANCE to it is
// evaluated in the query's own unwrapped local frame — the standard
// tileable-cellular-noise split, so a point near one face still lights up
// texels just past the seam on the far side.

// Self-contained like dustNoiseBake.wesl beside it: the tool's own WESL root
// (tools/galaxy-renderer/wesl.toml) symlinks lib/camera.wesl, lib/tonemap.wesl
// etc. leaf by leaf, and 'lib/math.wesl' is not among them — importing
// package::lib::math::TAU/saturate resolves fine in the MAIN app's build but
// fails to link ('module not found') in the tool's, so TAU and saturate are
// both declared locally instead. WGSL has no built-in 'saturate' (see
// lib/math.wesl's own header); this is 'clamp(x, 0.0, 1.0)' under a name
// that reads as intent, same as that module's version.
const TAU: f32 = 6.28318530717958;

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

@group(0) @binding(0) var dst: texture_storage_3d<rgba8unorm, write>;

/** Lattice cells per axis — one point per cell, ~CELLS^3 points total (32768 at 32). */
const CELLS: u32 = 32u;
/** Point sigma as a fraction of one cell's own width, balanced against this bake's own texel density (128/CELLS = 4 texels/cell): small enough that most of a cell reads near-zero between points (spacing-to-sigma ~3.6, so points stay visually discrete rather than merging into a lumpy field), large enough (~1.1 texels) that the trilinear sampler still resolves each one as a soft blob rather than a single hard texel. */
const POINT_SIGMA_CELLS: f32 = 0.28;
/** mu/sigma of the UNDERLYING normal (not the amplitude itself) — eyeballed so most draws stay under ~0.4 and roughly one cell in twenty clears 1 (clipped to full brightness by saturate() below). A starting point for visual calibration, not a measurement. */
const LOGNORMAL_MU: f32 = -1.4;
const LOGNORMAL_SIGMA: f32 = 0.9;

// integerHash3 — same avalanche dustNoiseBake.wesl's own uses, duplicated
// rather than imported: that file's own header already declined to grow a
// shared lib for one 3D tileable consumer, and importing across two compute
// bakes would couple this file's tiling to whatever dustNoiseBake.wesl's
// hash happens to do next.
fn integerHash3(p: vec3<i32>) -> f32 {
  let x = bitcast<u32>(p.x);
  let y = bitcast<u32>(p.y);
  let z = bitcast<u32>(p.z);
  var h = x * 374761393u + y * 668265263u + z * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967295.0;
}

/** One hash draw for 'cell', salted so a cell's position (x/y/z) and amplitude (u1/u2) never share a lattice offset. */
fn cellHash(cell: vec3<i32>, salt: i32) -> f32 {
  return integerHash3(cell + vec3<i32>(salt, salt * 7, salt * 13));
}

// cellAmplitude — this cell's own log-normal brightness. Box-Muller off two
// independent draws of the SAME cell: the point this cell owns gets exactly
// one brightness, never a second competing draw a per-texel evaluation
// could reintroduce.
fn cellAmplitude(cell: vec3<i32>) -> f32 {
  let u1 = max(cellHash(cell, 404), 1e-6);
  let u2 = cellHash(cell, 505);
  let z = sqrt(-2.0 * log(u1)) * cos(TAU * u2);
  return exp(LOGNORMAL_MU + LOGNORMAL_SIGMA * z);
}

@compute @workgroup_size(4, 4, 4)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid >= dims)) {
    return;
  }
  let uv = (vec3<f32>(gid) + 0.5) / vec3<f32>(dims);
  let p = uv * f32(CELLS);
  let cellsI = i32(CELLS);
  let ownCell = vec3<i32>(floor(p));

  var value = 0.0;
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let offset = vec3<i32>(dx, dy, dz);
        // Hash key wraps for tiling; the point's own local position stays
        // unwrapped (ownCell + offset), so distance below is correct across
        // a tile seam — see this file's own header.
        let wrapped = (ownCell + offset + vec3<i32>(cellsI)) % vec3<i32>(cellsI);
        let jitter = vec3<f32>(cellHash(wrapped, 101), cellHash(wrapped, 202), cellHash(wrapped, 303));
        let pointPos = vec3<f32>(ownCell + offset) + jitter;
        let d = p - pointPos;
        let g = exp(-0.5 * dot(d, d) / (POINT_SIGMA_CELLS * POINT_SIGMA_CELLS));
        value = max(value, cellAmplitude(wrapped) * g);
      }
    }
  }
  textureStore(dst, vec3<i32>(gid), vec4<f32>(saturate(value)));
}
