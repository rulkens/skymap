// starCatalog/vertex.wesl — vertex-pull billboard stage for the survey
// (Gaia bin) stars.
//
// One instance = one octree record (a leaf star, or an interior node's
// flux-mip aggregate). The record is not a vertex attribute: it is PULLED
// from a per-source read-only storage blob at index 'firstRecord +
// instance_index', so the renderer uploads the record bytes once and the
// per-frame cost is just per-node draw calls, not a re-baked instance
// buffer. See the starCatalogRenderer module header for the storage /
// dynamic-offset discipline.
//
// ## Bindings
//
//   @group(0) @binding(0)  cam     CameraUniforms — the rebased,
//                                   camera-relative view-projection + viewport.
//   @group(1) @binding(0)  node    NodeParams (DYNAMIC OFFSET) — this draw's
//                                   octree node: box origin (camera-relative),
//                                   box scale, record-slice base, opacity.
//   @group(2) @binding(0)  records array<u32> — the source's whole record
//                                   blob, two u32 halves per 6-byte record.
//
// ## Record unpack (bit-for-bit the inverse of packStarRecord)
//
// The on-disk 6-byte record is two independent 24-bit halves (JS bitwise ops
// are signed-32, so the 48-bit field is never one integer — see
// starCatalogFormat.ts). The renderer repacks each record into two u32 at
// upload ('lo' = on-disk bytes 0..2, 'hi' = bytes 3..5), so here:
//
//   offsetX = lo bits  0..9        offsetY = lo bits 10..19
//   offsetZ = lo bits 20..23 (low 4) | hi bits 0..5 (high 6)   ← the split
//   absMagIdx = hi bits  6..12 (7)   colorIdx = hi bits 13..18 (6)
//
// The offsetZ straddle across the 24-bit boundary is the named trap: its low
// 4 bits ride in 'lo', its high 6 bits in 'hi'.
//
// ## World reconstruction (the precision seam's GPU half)
//
// starNodeOriginRelCamMpc already did the large-minus-large subtraction in
// f64 and handed us a small camera-relative origin, so here the f32 math is
// well-conditioned:
//
//   worldRelCam = originRelCamMpc + (offset / 1024) * cellScaleMpc
//
// ## Flux-integrated glow (the LOD-invisible sizing)
//
// The physical target: an aggregate drawn at distance D deposits the same
// integrated on-screen luminance as its children would if the walker refined
// it, so the LOD transition is photometrically invisible. Two facts make this
// a single continuous formula rather than a leaf/aggregate special case:
//
//   1. FLUX IS ADDITIVE, AND THE RECORD + COUNT RECONSTRUCT THE SUM.
//      flux = 10^(-0.4 * absMag) dequantizes the record's magnitude. For a leaf
//      that is its one star's flux; for an aggregate it is the subtree's MEAN
//      star flux, because mergeFluxAggregate stores absMag = -2.5*log10(sum/N),
//      the mean -- NOT the sum. A summed magnitude of thousands of stars is 10+
//      mag past the LUT's single-star floor and would clamp to one brightness
//      (a visible box lattice, and a flux jump when the LOD refines a clamped
//      node); a mean stays in-window and never clamps. Multiplying the mean
//      flux by 'node.subtreeStarCount' (the runtime-derived leaf-star count of
//      the subtree, 1.0 for a leaf) recovers the subtree's SUMMED light. So if
//      every record deposits L = EXPOSURE * flux, drawing an aggregate
//      (L = EXPOSURE * mean * N) equals drawing its refined children
//      (sum of EXPOSURE * flux_child) -- identical total. The cut is a covering
//      partition (walkStarOctreeCut), so no double-count.
//
//   2. THE GAUSSIAN DOT'S INTEGRAL IS PEAK * AREA * SHAPE.
//      A dot of peak I and pixel-radius rPx deposits I * rPx^2 * K_GAUSS of
//      luminance (K_GAUSS = the integral over the unit disc of the RIM-ZEROED
//      glow profile the fragment paints -- see the K_GAUSS constant + fragment.wesl).
//      To hit L = EXPOSURE * fluxApp we set I = EXPOSURE * fluxApp / (K_GAUSS * rPx^2).
//      Total luminance is then INVARIANT to rPx -- rPx only chooses how the
//      fixed light spreads (a bright core vs a soft glow), never how much.
//      ('fluxApp' is the apparent, inverse-square-dimmed flux -- next section.)
//
// ## Apparent flux: inverse-square dimming
//
// Fact 1's 'flux' is INTRINSIC luminosity (10^(-0.4*absMag) * subtreeStarCount)
// -- the light the star or subtree emits, independent of the camera. What
// reaches the eye falls off as 1/d^2; depositing the intrinsic value blows the
// far field to white when zoomed out (the whole galaxy's light arrives
// un-dimmed) while the near-Sun view still looks right. So we convert to
// APPARENT flux before sizing the dot:
//
//   fluxApp = flux * D_REF_MPC^2 / max(d2, MIN_D2_MPC2)
//
// where d2 = dot(worldRelCam, worldRelCam) is the record's squared camera
// distance in Mpc^2. 'worldRelCam' is the record's camera-relative position,
// computed BEFORE the billboard corner expansion, so it is the true node
// distance rather than a corner's.
//
//   D_REF_MPC = 1e-5 Mpc = 10 parsecs -- the distance at which ABSOLUTE
//     magnitude is DEFINED. A record's LUT flux is therefore exactly its
//     apparent flux seen from 10 pc, which makes the factor D_REF^2/d2 equal 1
//     at 10 pc and dim or brighten honestly from there. Anchoring on the
//     magnitude system's own zero distance keeps the attenuation dimensionally
//     grounded rather than an arbitrary tuning constant.
//   MIN_D2_MPC2 = (1e-7)^2 = 1e-14 Mpc^2 = (0.1 pc)^2 -- a floor on d2 guarding
//     the fly-through singularity. The alternative -- letting 1/d2 diverge as
//     the camera passes through a star -- spikes the peak toward infinity and
//     flashes the whole frame white; 0.1 pc is closer than any camera approach
//     needs, so the clamp never bites a real view and only tames the pole.
//
// f32 range: the brightest aggregate reaches intrinsic flux ~2.5e9; times
// D_REF^2 = 1e-10 the numerator is ~0.25, safely inside f32 BEFORE the /d2
// (which only shrinks it). A faint leaf far away underflows toward 0 harmlessly
// -- its light shows up summed in an ancestor aggregate instead.
//
// The only place the two record species differ is the RADIUS. A leaf is a
// POINT source, so its radius is a legibility floor. An aggregate is an
// EXTENDED source -- its subtree fills its octree box -- so its radius grows
// to the box's on-screen footprint ('worldLenToPx' of the box edge), which is
// what makes adjacent far aggregates' glows meet edge-to-edge into a
// continuous field instead of a lattice of lone dots. 'node.level' is the
// discriminant (0 = leaf point, >0 = aggregate box); a 'select' picks the box
// extent for aggregates and 0 for leaves, so the leaf falls out as the
// extent = 0 case of one formula. Everything scales by the user's live
// 'sizePx' slider, which therefore acts as a global spread/sharpness control
// (total luminance is unaffected -- see fact 2).
//
// ## Brightness: the calibrated baseline and the user's trim
//
// STAR_FLUX_EXPOSURE is the eye-tuned CALIBRATED baseline -- the exposure that
// makes the starfield read right at the default setting. On top of it the user
// gets a live 'brightness' trim ('u.brightness', settings.starCatalogs.brightness,
// the twin of the galaxy points' brightness): the deposited luminance is
// STAR_FLUX_EXPOSURE * u.brightness * fluxApp, so 1.0 leaves the calibrated look
// untouched and the slider scales the whole starfield's luminance up or down.
// Unlike 'sizePx' (which redistributes a FIXED luminance across a wider/narrower
// dot -- fact 2), 'brightness' changes the total luminance itself.
//
// ## Glow overlap: dissolving the box lattice (aggregates only)
//
// An aggregate's glow is sized to its box footprint (above), so at the refine
// threshold adjacent aggregates meet edge-to-edge -- but a box edge that lands
// on a hard falloff still reads as a faint lattice cell. 'u.glowOverlap'
// ('settings.starCatalogs.glowOverlap', 1.0 = identity) multiplies the AGGREGATE
// radius so each glow spills PAST its box and overlaps its neighbours, melting
// the lattice into a continuous field. It is a 'sizePx'-style spread, not a
// 'brightness': because the peak is computed from the FINAL 'rPx' (peak =
// EXPOSURE*fluxApp / (K*rPx^2), fact 2), folding 'glowOverlap' into 'rPx' divides
// the peak by 'glowOverlap^2' automatically, so total luminance is conserved --
// no separate peak term is needed. Leaves are POINT sources with no box to spill
// past, so they select 1.0 and stay exactly as they were.

import package::starCatalog::io::VSOut;
import package::starCatalog::io::NodeParams;
import package::starCatalog::io::StarUniforms;
import package::starCatalog::tint::starTint;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::billboard::worldLenToPx;

@group(0) @binding(0) var<uniform> u: StarUniforms;
@group(1) @binding(0) var<uniform> node: NodeParams;
@group(2) @binding(0) var<storage, read> records: array<u32>;

// Magnitude / colour LUT dequant constants — mirror the frozen windows in
// src/data/starCatalog/starCatalogFormat.ts (LOCKED; consume, never diverge).
//   lutIndexToAbsMag(i) = STAR_ABSMAG_MIN + (i + 0.5) * STAR_ABSMAG_STEP
//   colorIdxToBpRp(i)   = STAR_COLORIDX_MIN + (i + 0.5) * STAR_COLORIDX_STEP
const STAR_ABSMAG_MIN: f32 = -6.0;
const STAR_ABSMAG_STEP: f32 = 0.19;
const STAR_COLORIDX_MIN: f32 = -0.6;
// STAR_COLORIDX_STEP = (STAR_COLORIDX_MAX - STAR_COLORIDX_MIN) / STAR_COLORIDX_LEVELS
//                    = (4.4 - (-0.6)) / 64 = 0.078125.
const STAR_COLORIDX_STEP: f32 = 0.078125;

// In-cell 10-bit offset unit: reciprocal of 1024 (offset 0..1023 spans one box).
const OFFSET_SCALE: f32 = 0.0009765625; // 1.0 / 1024.0

// Depth epsilon: pull the clamped clip-z this far inside the far plane so a
// point sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

// Reference star-dot size in px — mirrors DEFAULT_STAR_SIZE_PX
// (src/data/defaults.ts; consume, never diverge). Dividing the user's
// 'u.sizePx' by it makes the DEFAULT setting the identity ('sizeScale' == 1),
// so the tuned look holds at the default and only slider movement away from it
// rescales the whole starfield's spread.
const STAR_SIZE_REF_PX: f32 = 2.5;

// Legibility floor for a POINT source in px (at the default size). A leaf star
// -- and any aggregate whose box has shrunk below this on screen -- is drawn
// no smaller than this so a lone record stays a visible dot. Scaled by
// 'sizeScale' with every other radius here.
const STAR_GLOW_MIN_PX: f32 = 1.5;

// Glow shape integral over the unit uv-disc of the RIM-ZEROED profile the
// fragment paints: g(r2) = (exp(-r2 * 4.0) - EDGE) / (1 - EDGE), EDGE = e^-4.
// Shifting the bare Gaussian down by its rim value and rescaling makes g reach
// exactly 0 at r = 1 (no hard-edged disc) while keeping g(0) = 1. Its integral:
//   K_GAUSS = (K_OLD - pi*EDGE) / (1 - EDGE)
// where K_OLD = (pi/4) * (1 - e^-4) ~= 0.7711 is the bare Gaussian's disc
// integral and pi*EDGE ~= 0.05754 is the subtracted pedestal over the unit disc
// (area pi). Numerically:
//   K_GAUSS = (0.7711 - 0.05754) / (1 - 0.018316) = 0.71357 / 0.98168 ~= 0.7268.
// The dot deposits I_peak * rPx^2 * K_GAUSS of screen luminance (fact 2 in the
// header); dividing the target luminance by it recovers the peak. Structural,
// not a knob -- MUST mirror EDGE and the profile in fragment.wesl.
const K_GAUSS: f32 = 0.7268;

// Inverse-square apparent-flux reference distance (Mpc). 1e-5 Mpc = 10 parsecs,
// the distance at which ABSOLUTE magnitude is defined -- so a record's LUT flux
// is its apparent flux from 10 pc and the factor D_REF^2/d2 is 1 there (header
// 'Apparent flux'). Squared once at the callsite.
const D_REF_MPC: f32 = 1e-5;

// Floor on squared camera distance (Mpc^2), guarding the fly-through 1/d2 pole.
// (1e-7)^2 = (0.1 pc)^2 -- closer than any camera approach, so it tames the
// singularity without dimming a legitimate view. The unclamped alternative lets
// the peak diverge and flashes the whole frame white on pass-through.
const MIN_D2_MPC2: f32 = 1e-14; // (1e-7)^2

// THE exposure knob (eye-tuned via HMR, on top of the live 'brightness' slider).
// A record deposits screen luminance STAR_FLUX_EXPOSURE * brightness * fluxApp,
// where fluxApp = 10^(-0.4 * absMag) * subtreeStarCount * D_REF^2/d2 is the
// APPARENT flux -- the intrinsic LUT flux dimmed by inverse-square (header
// 'Apparent flux'). The 6000.0 baseline folds the user's eye-tuned near-field
// display exposure (15x over the raw inverse-square calibration, was 400.0) into
// the constant, so brightness-slider 1.0 IS the tuned near-field look. The scale
// DEPENDENCE of that display exposure -- ~15x near (solar-system scale) rising to
// ~70x at whole-galaxy scale, a legibility need a monitor can't meet by
// dark-adapting like the eye -- rides in on the 'brightness' the layer forwards:
// starCatalogLayer multiplies a camera-distance ramp (starExposureRamp) into it,
// so 'brightness' here already carries the scale trim (see that module).
// Reference points at the default, for a star at ~100 pc (fluxApp = intrinsic x
// 1e-2): a bright star (absMag ~= 1, intrinsic flux ~= 0.4) peaks around
// 6000 * 4e-3 ~= 24 at the floor radius; a blue giant (absMag ~= -3, intrinsic
// flux ~= 16) peaks ~40x higher and blooms in the HDR pipeline; a red dwarf
// (absMag ~= 12, intrinsic flux ~= 2e-5) stays a near-invisible point whose
// light shows up summed in its ancestor aggregate. Nearer stars brighten as
// 1/d2, farther ones dim; the user eye-tunes the overall level here + via the
// brightness slider. Every other constant here is structural.
const STAR_FLUX_EXPOSURE: f32 = 6000.0;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  // Vertex-pull this instance's record: 'firstInstance' stays 0, so
  // 'instance_index' is the in-node record index; the base offset is the
  // node's slice start. Two u32 per record in the repacked blob.
  let base = node.firstRecord + ii;
  let lo = records[base * 2u + 0u];
  let hi = records[base * 2u + 1u];

  // Unpack — bit-for-bit unpackStarRecord. offsetZ's low 4 bits from 'lo',
  // high 6 bits from 'hi'.
  let ox = f32(lo & 0x3ffu);
  let oy = f32((lo >> 10u) & 0x3ffu);
  let oz = f32(((lo >> 20u) & 0xfu) | ((hi & 0x3fu) << 4u));
  let absMagIdx = (hi >> 6u) & 0x7fu;
  let colorIdx = (hi >> 13u) & 0x3fu;

  // World position, camera-relative (the f64 rebase already happened CPU-side).
  let offset = vec3<f32>(ox, oy, oz) * OFFSET_SCALE;
  let worldRelCam = node.originRelCamMpc + offset * node.cellScaleMpc;

  // Inverse-square attenuation: 'worldRelCam' is the record's camera-relative
  // position (Mpc), computed here BEFORE corner expansion, so its squared length
  // is the squared camera distance. D_REF^2/d2 dims the intrinsic LUT flux to
  // the apparent flux the eye receives -- = 1 at 10 pc -- with the floor guarding
  // the fly-through pole (header 'Apparent flux').
  let d2 = dot(worldRelCam, worldRelCam);
  let atten = (D_REF_MPC * D_REF_MPC) / max(d2, MIN_D2_MPC2);

  let center = worldToClip(u.cam, worldRelCam);
  let corner = triCorner(vi);

  // Dequant absolute magnitude (bin centre), then the linear flux it stands
  // for. For a leaf this is one star's flux; for an aggregate it is the
  // subtree's MEAN star flux (mergeFluxAggregate stores -2.5*log10(sum/N), the
  // mean, because a summed magnitude would clamp the 7-bit LUT). Multiplying by
  // 'node.subtreeStarCount' recovers the subtree's SUMMED flux -- and that count
  // is 1.0 for a leaf, so leaf and aggregate share one formula (header fact 1).
  let absMag = STAR_ABSMAG_MIN + (f32(absMagIdx) + 0.5) * STAR_ABSMAG_STEP;
  let flux = pow(10.0, -0.4 * absMag) * node.subtreeStarCount;
  // Intrinsic -> apparent: dim by the inverse-square factor computed above.
  let fluxApp = flux * atten;

  // Radius (px). A leaf is a POINT source -> the legibility floor. An aggregate
  // is an EXTENDED source -> its glow fills the box's on-screen footprint so
  // neighbouring far aggregates blend into a continuous field, not a lattice.
  // 'worldLenToPx' of the box edge gives its full on-screen span; half of that
  // is the dot radius (diameter == box edge), and the Gaussian's soft tail
  // spills a little past the box so adjacent glows overlap. 'select' picks the
  // box extent only for aggregates (level > 0); a leaf gets extent 0 -> floor.
  // All scaled by the user's size slider (spread control; luminance is
  // invariant to radius -- header fact 2).
  let sizeScale = u.sizePx / STAR_SIZE_REF_PX;
  let extentMpc = select(0.0, node.cellScaleMpc, node.level > 0u);
  let boxRadiusPx = worldLenToPx(u.cam, extentMpc, center.w) * 0.5;
  // Glow overlap spreads AGGREGATE glows past their box footprint so the lattice
  // dissolves; leaves (point sources) select 1.0 and are untouched. Folded into
  // 'rPx' here, so the peak's /(K*rPx^2) below divides by 'glowOverlap^2' too --
  // total luminance stays conserved (header 'Glow overlap' + fact 2).
  let overlap = select(1.0, u.glowOverlap, node.level > 0u);
  let rPx = max(STAR_GLOW_MIN_PX, boxRadiusPx) * sizeScale * overlap;

  // Peak so the dot's INTEGRATED luminance equals STAR_FLUX_EXPOSURE * fluxApp
  // regardless of rPx: I_peak * K_GAUSS * rPx^2 == EXPOSURE * fluxApp. Refining
  // an aggregate or not therefore deposits identical total light (header fact 2).
  // 'u.brightness' is the user's exposure trim ON TOP of the calibrated
  // STAR_FLUX_EXPOSURE baseline (1.0 = identity -- see the header). 'fluxApp' is
  // the inverse-square-dimmed apparent flux (header 'Apparent flux').
  let intensity = STAR_FLUX_EXPOSURE * u.brightness * fluxApp / (K_GAUSS * rPx * rPx);

  let screenOffset = expandBillboardScreen(u.cam, center, rPx, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(screenOffset, 0.0, 0.0);

  // Survive the adaptive foreground far plane on a deep descent — identical to
  // bodies/starPoints. Safe ONLY because this is the depthless additive HDR
  // pass (no depth test/write), so clamping clip-z perturbs no depth compare.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS));

  out.uv = corner;

  // Dequant BP−RP colour (bin centre) → stellar spectral tint.
  let bpRp = STAR_COLORIDX_MIN + (f32(colorIdx) + 0.5) * STAR_COLORIDX_STEP;
  out.color = starTint(bpRp);
  out.opacity = node.opacity;
  out.intensity = intensity;
  return out;
}
