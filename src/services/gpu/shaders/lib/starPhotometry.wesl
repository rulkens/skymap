// lib/starPhotometry.wesl — the shared photometric core both star vertex
// stages agree on, so a famous-star sprite and a survey (Gaia bin) leaf of the
// same absolute magnitude, colour and camera distance render pixel-identically.
//
// ## The parity contract
//
// Two vertex stages draw additive point-source stars into the depthless HDR
// accumulation:
//
//   - starCatalog/vertex.wesl — the survey (Gaia bin) octree, whose records are
//     leaf point stars OR interior flux-mip aggregates. It keeps its own
//     aggregate-specific sizing (box footprint radius, glowOverlap spread,
//     subtreeStarCount flux reconstruction).
//   - bodies/starPoints/vertex.wesl — the hand-seeded famous / scene stars,
//     always POINT sources (leaves), no aggregate branch.
//
// What they MUST share to stay photometrically identical is this module: the
// sizing reference + glow floor/ceiling, the inverse-square apparent-flux
// reference distance + its fly-through floor, the calibrated exposure baseline,
// and the peak-from-flux relation (starPeakIntensity). A leaf drawn by either
// stage from the same (absMag, colour, camera distance) and the same user
// sizePx / brightness therefore deposits the same screen luminance per unit
// solid angle through the same-shaped dot. The fragment stages share the
// rim-zeroed Gaussian profile (whose disc integral is K_GAUSS below) and the
// hue-preserving knee (lib/starKnee.wesl), completing the equal-pixels
// guarantee.
//
// The constants live here rather than in either consumer so the two can never
// drift a value apart and silently break the parity — the same single-source
// discipline lib/starKnee.wesl states for the compression constant.

// Reference star-dot size in px — mirrors DEFAULT_STAR_SIZE_PX
// (src/data/defaults.ts; consume, never diverge). Dividing the user's
// 'sizePx' slider by it makes the DEFAULT setting the identity ('sizeScale'
// == 1), so the tuned look holds at the default and only slider movement away
// from it rescales the whole starfield's spread.
const STAR_SIZE_REF_PX: f32 = 2.5;

// Legibility floor for a POINT source in px (at the default size). A leaf star
// -- and any survey aggregate whose box has shrunk below this on screen -- is
// drawn no smaller than this so a lone record stays a visible dot. Scaled by
// 'sizeScale' with every other radius.
const STAR_GLOW_MIN_PX: f32 = 1.5;

// Ceiling on the glow radius in px, bounding per-star FILL. Additive-blend
// overdraw scales with the SUM of pi*rPx^2 across drawn quads, so at
// solar-neighbourhood zoom a few dozen near stars whose glows expand to
// thousands of px each dominate the whole pass. Clamping the DRAWN radius
// caps each quad at pi*MAX^2 regardless of proximity. Both vertex stages
// compute the peak from the PRE-CEILING radius (starPeakIntensity), so the
// ceiling also caps SURFACE BRIGHTNESS: a radius-capped source keeps the peak
// it held when it reached the ceiling and under-deposits total light by
// (capped/raw)^2, rather than concentrating a still-growing 1/d^2 flux into
// an ever-brighter fixed-size core. Feeding the CAPPED radius to the peak
// would conserve total light instead -- that alternative made near survey
// aggregates blow out into saturated blobs around the Sun in the band where
// they are radius-capped but not yet refined to leaves (see the survey
// stage's capped-aggregate note in starCatalog/vertex.wesl).
const STAR_GLOW_MAX_PX: f32 = 384.0;

// Rim value of the bare Gaussian: exp(-4), the profile's height at r = 1. The
// rim-zeroed profile (starGlowProfile below) subtracts it and rescales so the
// dot fades to exactly 0 at the disc edge while keeping g(0) = 1; K_GAUSS
// integrates that shifted profile.
const EDGE: f32 = 0.0183156; // exp(-4)

// Glow shape integral over the unit uv-disc of the RIM-ZEROED profile the
// fragment paints: g(r2) = (exp(-r2 * 4.0) - EDGE) / (1 - EDGE), EDGE = e^-4.
// Shifting the bare Gaussian down by its rim value and rescaling makes g reach
// exactly 0 at r = 1 (no hard-edged disc) while keeping g(0) = 1. Its integral:
//   K_GAUSS = (K_OLD - pi*EDGE) / (1 - EDGE)
// where K_OLD = (pi/4) * (1 - e^-4) ~= 0.7711 is the bare Gaussian's disc
// integral and pi*EDGE ~= 0.05754 is the subtracted pedestal over the unit disc
// (area pi). Numerically:
//   K_GAUSS = (0.7711 - 0.05754) / (1 - 0.018316) = 0.71357 / 0.98168 ~= 0.7268.
// The dot deposits I_peak * rPx^2 * K_GAUSS of screen luminance; dividing the
// target luminance by it recovers the peak (starPeakIntensity). Structural, not
// a knob -- the shape it integrates is EDGE (above) + starGlowProfile (below),
// which both fragment stages import.
const K_GAUSS: f32 = 0.7268;

// The rim-zeroed Gaussian glow profile both fragment stages paint, shared here
// so its shape can never drift from the K_GAUSS that integrates it. The bare
// 'exp(-r2 * 4.0)' still holds EDGE = e^-4 ~= 1.83% of its peak at the disc edge
// (r2 = 1); on saturated peaks that residue reads as a hard-edged bright disc.
// Shifting down by EDGE and rescaling by 1/(1 - EDGE) lands the profile exactly
// on 0 at the rim while keeping g(0) = 1. 'r2' is the squared distance-from-centre
// the caller already computed for its own unit-disc discard.
fn starGlowProfile(r2: f32) -> f32 {
  return (exp(-r2 * 4.0) - EDGE) / (1.0 - EDGE);
}

// Inverse-square apparent-flux reference distance (Mpc). 1e-5 Mpc = 10 parsecs,
// the distance at which ABSOLUTE magnitude is DEFINED -- so a record's LUT flux
// is exactly its apparent flux seen from 10 pc, which makes the factor
// D_REF^2/d2 equal 1 at 10 pc and dim or brighten honestly from there.
// Anchoring on the magnitude system's own zero distance keeps the attenuation
// dimensionally grounded rather than an arbitrary tuning constant. Squared once
// at the callsite.
const D_REF_MPC: f32 = 1e-5;

// Floor on squared camera distance (Mpc^2), guarding the fly-through 1/d2 pole.
// (1e-7)^2 = (0.1 pc)^2 -- closer than any camera approach needs, so the clamp
// never bites a real view and only tames the singularity. The unclamped
// alternative -- letting 1/d2 diverge as the camera passes through a star --
// spikes the peak toward infinity and flashes the whole frame white.
const MIN_D2_MPC2: f32 = 1e-14; // (1e-7)^2

// THE exposure knob (eye-tuned via HMR, on top of the live 'brightness' slider).
// A record deposits screen luminance STAR_FLUX_EXPOSURE * brightness * fluxApp,
// where fluxApp is the APPARENT flux -- the intrinsic LUT flux dimmed by
// inverse-square (D_REF^2/d2). The 2400.0 baseline folds the user's eye-tuned
// near-field display exposure (6x over the raw inverse-square calibration of
// 400.0) into the constant, so brightness-slider 1.0 IS the tuned near-field
// look. The scale DEPENDENCE of that display exposure -- ~6x near rising to
// ~28x at whole-galaxy scale, a legibility need a monitor can't meet by
// dark-adapting like the eye -- rides in on the 'brightness' the layer forwards
// (starExposureRamp multiplies a camera-distance ramp into it). Every other
// constant here is structural.
const STAR_FLUX_EXPOSURE: f32 = 2400.0;

// Canvas height the exposure baseline above is calibrated at. Radii are
// converted to this reference unit (toRefPx) before the peak, so a record
// deposits light per unit SOLID ANGLE rather than per device pixel -- without
// it, halving canvas height quadrupled deposited luminance (measured 270p at
// 3.6x the mean luminance of 1080p, same scene). Trades off exactly against
// STAR_FLUX_EXPOSURE -- moving one is equivalent to rescaling the other, one
// degree of freedom between the pair -- so STAR_FLUX_EXPOSURE alone is the
// look knob; this stays fixed.
const REF_VIEWPORT_PX_Y: f32 = 1080.0;

// Converts a device-pixel radius into REF_VIEWPORT_PX_Y-relative reference px,
// the resolution-independent unit starPeakIntensity's peak is calibrated in.
// Both vertex stages MUST route their radius through this before the peak, or
// the pixel-parity contract between them breaks.
fn toRefPx(rPx: f32, viewportPxY: f32) -> f32 {
  return rPx * (REF_VIEWPORT_PX_Y / viewportPxY);
}

// ── starPeakIntensity ────────────────────────────────────────────────────────
//
// The peak amplitude that makes a dot's INTEGRATED screen luminance equal
// STAR_FLUX_EXPOSURE * brightness * fluxApp regardless of canvas size:
// I_peak * K_GAUSS * rRefPx^2 == EXPOSURE * fluxApp * brightness. So drawing a
// record at any reference-px radius deposits the same light PER UNIT SOLID
// ANGLE (a wider dot just spreads a fixed luminance thinner) -- the invariance
// the survey stage leans on for LOD-invisible aggregate sizing, and the reason
// the famous-star sprite obeys the size slider without changing brightness.
//
//   brightness -- the user's exposure trim on top of the calibrated baseline
//                 (1.0 = identity), carrying the scale-dependent display ramp
//                 the layer folds in (starExposureRamp).
//   fluxApp    -- the inverse-square-dimmed apparent flux
//                 (10^(-0.4*absMag) * D_REF^2 / max(d2, MIN_D2_MPC2), times the
//                 survey aggregate's subtreeStarCount where it applies).
//   rRefPx     -- the PRE-CEILING glow radius, in reference px (toRefPx).
//                 Both stages pass the radius from BEFORE the
//                 STAR_GLOW_MAX_PX clamp, so a radius-capped source freezes
//                 its surface brightness at the ceiling instead of
//                 over-concentrating (see STAR_GLOW_MAX_PX).
//
// Both vertex stages call this with the identical expression, so an equal
// (brightness, fluxApp, rRefPx) yields an equal peak -- the numeric half of
// the pixel-parity contract.
fn starPeakIntensity(brightness: f32, fluxApp: f32, rRefPx: f32) -> f32 {
  return STAR_FLUX_EXPOSURE * brightness * fluxApp / (K_GAUSS * rRefPx * rRefPx);
}
