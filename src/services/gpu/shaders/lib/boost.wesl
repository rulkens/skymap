// lib/boost.wesl — the observer's boost, for the renderers that recolour light
// (stars, galaxies, the Milky Way). Byte-layout contract: BoostUniforms is two
// vec4 slots, appended to each renderer's own uniform tail; its CPU writer is
// 'writeBoostUniforms' (services/gpu/lib/boostUniforms.ts). All-zero is the
// identity block (doppler 0, contraction 0, headlight 0), so a zero-init or
// never-written tail draws the rest frame.
//
// Import-free on purpose: the galaxy-renderer tool links the Milky Way sprite
// shaders through per-file symlinks, so every module they import needs one.

const HEADLIGHT_CEIL: f32 = 64.0;
const GALAXY_HUE_SLOPE: f32 = 0.25;

// The star tint ramp's anchors (starCatalog/tint.wesl's breakpoints) paired
// with blackbody temperatures; STAR_TINT_BLACKBODY_ANCHORS is the TS twin.
const ANCHOR_BPRP_OB: f32 = -0.30;
const ANCHOR_BPRP_AF: f32 = 0.30;
const ANCHOR_BPRP_G: f32 = 0.85;
const ANCHOR_BPRP_K: f32 = 1.25;
const ANCHOR_BPRP_M: f32 = 2.20;
const ANCHOR_TEMP_OB_K: f32 = 30000.0;
const ANCHOR_TEMP_AF_K: f32 = 7500.0;
const ANCHOR_TEMP_G_K: f32 = 5800.0;
const ANCHOR_TEMP_K_K: f32 = 4500.0;
const ANCHOR_TEMP_M_K: f32 = 3500.0;

struct BoostUniforms {
  // Unit direction of travel, in the renderer's own space.
  dir: vec3<f32>,
  beta: f32,
  gamma: f32,
  doppler: f32,
  contraction: f32,
  // The exponent k on D; 0 is off.
  headlight: f32,
};

// D = 1 / (gamma (1 - beta cos theta)). By gamma ~1e4 beta rounds to 1.0 in
// f32 and the naive form divides by zero dead ahead, so 1 - beta cos theta is
// split into (1 - beta) + beta (1 - cos theta), each term exact: 1 - beta from
// gamma, 1 - cos theta as half the squared chord between two unit vectors.
fn dopplerFactor(toSource: vec3<f32>, b: BoostUniforms) -> f32 {
  if (b.doppler == 0.0) { return 1.0; }
  // A source at the eye gets a finite D rather than a NaN that would poison
  // the additive HDR target.
  let n = toSource / max(length(toSource), 1e-30);
  let chord = n - b.dir;
  let oneMinusBeta = 1.0 / (b.gamma * b.gamma * (1.0 + b.beta));
  return 1.0 / (b.gamma * (oneMinusBeta + b.beta * 0.5 * dot(chord, chord)));
}

// Squash p along dir about the ship by 1/gamma: T(s) (I - (1 - 1/gamma) n n^T) T(-s).
fn contractAbout(p: vec3<f32>, ship: vec3<f32>, b: BoostUniforms) -> vec3<f32> {
  if (b.contraction == 0.0) { return p; }
  return p - (1.0 - 1.0 / b.gamma) * dot(p - ship, b.dir) * b.dir;
}

fn bpRpToLogTemp(bpRp: f32) -> f32 {
  var l = log(ANCHOR_TEMP_OB_K);
  l = mix(l, log(ANCHOR_TEMP_AF_K), clamp((bpRp - ANCHOR_BPRP_OB) / (ANCHOR_BPRP_AF - ANCHOR_BPRP_OB), 0.0, 1.0));
  l = mix(l, log(ANCHOR_TEMP_G_K), clamp((bpRp - ANCHOR_BPRP_AF) / (ANCHOR_BPRP_G - ANCHOR_BPRP_AF), 0.0, 1.0));
  l = mix(l, log(ANCHOR_TEMP_K_K), clamp((bpRp - ANCHOR_BPRP_G) / (ANCHOR_BPRP_K - ANCHOR_BPRP_G), 0.0, 1.0));
  l = mix(l, log(ANCHOR_TEMP_M_K), clamp((bpRp - ANCHOR_BPRP_K) / (ANCHOR_BPRP_M - ANCHOR_BPRP_K), 0.0, 1.0));
  return l;
}

// The inverse of bpRpToLogTemp over the same table; saturates at both ends.
fn logTempToBpRp(l: f32) -> f32 {
  var x = ANCHOR_BPRP_OB;
  x = mix(x, ANCHOR_BPRP_AF, clamp((log(ANCHOR_TEMP_OB_K) - l) / (log(ANCHOR_TEMP_OB_K) - log(ANCHOR_TEMP_AF_K)), 0.0, 1.0));
  x = mix(x, ANCHOR_BPRP_G, clamp((log(ANCHOR_TEMP_AF_K) - l) / (log(ANCHOR_TEMP_AF_K) - log(ANCHOR_TEMP_G_K)), 0.0, 1.0));
  x = mix(x, ANCHOR_BPRP_K, clamp((log(ANCHOR_TEMP_G_K) - l) / (log(ANCHOR_TEMP_G_K) - log(ANCHOR_TEMP_K_K)), 0.0, 1.0));
  x = mix(x, ANCHOR_BPRP_M, clamp((log(ANCHOR_TEMP_K_K) - l) / (log(ANCHOR_TEMP_K_K) - log(ANCHOR_TEMP_M_K)), 0.0, 1.0));
  return x;
}

// The colour a star of this BP-RP shows at Doppler factor d: its temperature
// times d, read back through the ramp's own anchors (an approximation: a
// blackbody's colour is a function of T alone, and D scales T exactly).
fn boostedBpRp(bpRp: f32, d: f32) -> f32 {
  if (d == 1.0) { return bpRp; }
  return logTempToBpRp(bpRpToLogTemp(bpRp) + log(d));
}

// Galaxy colour index shifted by K_CI per octave of D; a visualisation, not photometry.
fn boostedColorIndex(ci: f32, d: f32) -> f32 {
  return clamp(ci - GALAXY_HUE_SLOPE * log2(d), 0.0, 2.0);
}

// pow(d, k) under a soft ceiling; k == 0 is exactly 1.
fn headlightGain(d: f32, b: BoostUniforms) -> f32 {
  if (b.headlight == 0.0) { return 1.0; }
  let h = pow(d, b.headlight);
  return h / (1.0 + h / HEADLIGHT_CEIL);
}
