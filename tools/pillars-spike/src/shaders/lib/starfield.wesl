// lib/starfield.wesl — procedural deep-space background, shared by the
// fullscreen background pass AND the nebula raymarcher.
//
// Why shared: the nebula fragment re-composites the background BEHIND the
// volume (attenuated by the ray's chromatic transmittance) so background
// stars physically redden and dim through dust. The pixels outside the
// volume's screen footprint are painted by the background pass instead.
// Both must therefore evaluate the exact same function of the ray
// direction, or the volume's bounding box would show as a seam against
// the sky. Sharing one bgColor(dir) makes the seam impossible by
// construction rather than by tuning.
//
// ## Star layers
//
// Stars are cell-hashed points on a cube-face projection of the ray
// direction: project dir onto its dominant axis' unit cube face, grid the
// face, and give each cell at most one star at a hashed sub-position.
// Cube-face projection keeps cell density roughly uniform over the sphere
// (a naive lat/long grid would crowd stars at the poles). Three layers at
// different scales fake a magnitude distribution: few bright stars, many
// faint ones. Brightness follows a steep power law (hash^9) so a handful
// of stars reach several times HDR white and seed the bloom pyramid,
// exactly like real telescope frames where only the brightest stars grow
// diffraction halos.
//
// Cells straddling a cube edge get slightly irregular density — a static,
// unnoticeable artifact for a spike (each pixel's direction is fixed, so
// nothing pops during camera motion).

import package::lib::noise::hash31;
import package::lib::noise::fbm3;

// Map a direction to (face-local uv, face id). uv in [-1,1]².
fn cubeFaceUv(dir: vec3<f32>) -> vec3<f32> {
  let a = abs(dir);
  if (a.x >= a.y && a.x >= a.z) {
    return vec3<f32>(dir.y / a.x, dir.z / a.x, 1.0 + 0.5 * sign(dir.x));
  }
  if (a.y >= a.z) {
    return vec3<f32>(dir.x / a.y, dir.z / a.y, 3.0 + 0.5 * sign(dir.y));
  }
  return vec3<f32>(dir.x / a.z, dir.y / a.z, 5.0 + 0.5 * sign(dir.z));
}

// One star layer: cell-hashed HDR points of angular size ~1/scale.
fn starLayer(dir: vec3<f32>, scale: f32, maxBrightness: f32) -> vec3<f32> {
  let fuv = cubeFaceUv(dir);
  let g = fuv.xy * scale;
  let cell = floor(g);
  let f = fract(g);
  // Per-cell hashes: h1 gates star presence, h2/h3 place it, h4 sizes it,
  // h5 colours it. All derive from one 3D hash seeded by (cell, face).
  let seed = vec3<f32>(cell, fuv.z * 17.0);
  let h1 = hash31(seed);
  // Only ~28% of cells hold a star — sparse enough to read as sky, dense
  // enough that every framing has anchors.
  if (h1 > 0.28) {
    return vec3<f32>(0.0);
  }
  let sp = vec2<f32>(
    0.2 + 0.6 * hash31(seed + vec3<f32>(1.7, 0.0, 0.0)),
    0.2 + 0.6 * hash31(seed + vec3<f32>(0.0, 1.7, 0.0)),
  );
  let hB = hash31(seed + vec3<f32>(0.0, 0.0, 1.7));
  // Steep power law: most stars faint, a rare few at maxBrightness.
  let brightness = pow(hB, 9.0) * maxBrightness + pow(hB, 2.0) * 0.02;
  // Gaussian point-spread. Width in cell units; the /scale-invariant
  // falloff keeps stars sub-pixel-ish at every layer scale, letting bloom
  // (not the PSF) provide the big halos.
  let d = length(f - sp);
  let psf = exp(-d * d * 380.0);
  // Colour: hashed along a cool-to-hot ramp (red dwarfs → blue giants).
  let hC = hash31(seed + vec3<f32>(2.3, 2.3, 0.0));
  let color = mix(vec3<f32>(1.0, 0.72, 0.52), vec3<f32>(0.72, 0.82, 1.0), hC);
  return color * (brightness * psf);
}

// bgColor — the whole deep-space backdrop for a world-space ray direction.
fn bgColor(dir: vec3<f32>) -> vec3<f32> {
  // Base gradient: near-black with a faint cool lift toward +y (the
  // direction of the ionizing cluster — scattered light from the greater
  // HII region) and a warmer floor toward -y (the molecular cloud the
  // pillars root into).
  var c = mix(
    vec3<f32>(0.0065, 0.0045, 0.0050),
    vec3<f32>(0.0060, 0.0095, 0.0140),
    smoothstep(-0.7, 0.9, dir.y),
  );
  // Distant wispy nebulosity: thresholded low-frequency fbm of the
  // direction, kept very dim (an HDR value of ~0.03 tops) so it adds depth
  // without competing with the subject.
  let wisp = pow(max(fbm3(dir * 2.7 + vec3<f32>(5.0)) - 0.38, 0.0), 2.0);
  c = c + vec3<f32>(0.055, 0.035, 0.028) * wisp;
  let wisp2 = pow(max(fbm3(dir * 5.1 + vec3<f32>(13.0)) - 0.45, 0.0), 2.0);
  c = c + vec3<f32>(0.020, 0.030, 0.042) * wisp2;
  // Three star layers: sparse bright anchors, then progressively denser
  // and fainter populations.
  c = c + starLayer(dir, 14.0, 5.0);
  c = c + starLayer(dir, 36.0, 1.6);
  c = c + starLayer(dir, 90.0, 0.5);
  return c;
}
