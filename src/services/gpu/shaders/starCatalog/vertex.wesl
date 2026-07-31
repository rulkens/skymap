// starCatalog/vertex.wesl — vertex-pull billboard stage for the survey
// (Gaia bin) stars.
//
// One instance = one octree record (a leaf star, or an interior node's
// flux-mip aggregate). The whole cut is drawn in ONE instanced call, so an
// instance is not owned by a per-draw bind: the vertex stage ROUTES itself to
// its owning octree node by binary-searching the 'prefix' sum (below), then
// PULLS its record from the per-source storage blob at 'node.firstRecord +
// localIdx'. The renderer uploads the record bytes once, so the per-frame cost
// is one NodeParams + prefix write and a single draw — no per-node draw calls.
// See the starCatalogRenderer module header for the storage discipline.
//
// ## Bindings
//
//   @group(0) @binding(0)  cam        CameraUniforms — the rebased,
//                                      camera-relative view-projection + viewport.
//   @group(1) @binding(0)  nodeParams array<NodeParams> — every drawn node's
//                                      box origin, scale, record-slice base,
//                                      opacity, packed one element per draw slot.
//   @group(1) @binding(1)  prefix     array<u32> — each draw slot's exclusive
//                                      starting global instance index (a prefix
//                                      sum of record counts). 'arrayLength' of it
//                                      is the draw count.
//   @group(2) @binding(0)  records    array<u32> — the source's whole record
//                                      blob, two u32 halves per 6-byte record.
//
// ## Instance routing (the prefix-sum binary search)
//
// 'prefix' is strictly increasing from prefix[0] == 0 (every draw has >= 1
// record). For an instance index 'ii', its owning draw slot is the LARGEST s
// with prefix[s] <= ii; then the in-node record index is 'ii - prefix[s]'. A
// binary search finds s in ~log2(drawCount) <= 32 steps. The loop invariant
// 'prefix[slotLo] <= ii' holds at entry (slotLo starts 0, prefix[0] == 0 <= ii)
// and is preserved by only moving slotLo up to a mid whose prefix is still <= ii,
// so on exit (slotLo == slotHi) slotLo is that largest s — never out of range at
// ii == 0 or the last instance.
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
//      This exactness holds in the SUB-KNEE regime, where the fragment's
//      hue-preserving compression is ~linear (fragment.wesl); once a parent or
//      its children cross the knee the concave rolloff makes the refined sum
//      slightly brighter than the compressed parent -- an accepted LOD-seam
//      wobble in already-bright cores, the price of preserving hue there.
//
//   2. THE GAUSSIAN DOT'S INTEGRAL IS PEAK * AREA * SHAPE.
//      A dot of peak I and pixel-radius rPx deposits I * rPx^2 * K_GAUSS of
//      luminance (K_GAUSS = the integral over the unit disc of the RIM-ZEROED
//      glow profile the fragment paints -- see K_GAUSS in lib/starPhotometry.wesl
//      + fragment.wesl).
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
// continuous field instead of a lattice of lone dots. 'node.isAggregate' is the
// discriminant (0 = leaf point, 1 = aggregate box); a 'select' picks the box
// extent for aggregates and 0 for leaves, so the leaf falls out as the
// extent = 0 case of one formula. The layer derives that flag from the node's
// childMask, NOT its octree level -- a fat leaf sits at level > 0 yet is a leaf
// whose records are real point-source stars. Everything scales by the user's live
// 'sizePx' slider, which therefore acts as a global spread/sharpness control
// (total luminance is unaffected -- see fact 2).
//
// One deliberate exception to fact 2's invariance: the STAR_GLOW_MAX_PX
// ceiling bounds only the DRAWN radius, while the peak divides by the
// UNCAPPED radius -- so a near aggregate whose footprint outgrows the ceiling
// freezes at the surface brightness it held at the cap and under-deposits by
// (rPx/rPxRaw)^2, rather than concentrating its still-growing 1/d^2 flux into
// a saturated fixed-size blob (see the peak computation in 'vs').
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
// 'brightness': because the peak divides by the same overlap-spread radius
// (peak = EXPOSURE*fluxApp / (K*rPxRaw^2), fact 2), folding 'glowOverlap' into
// the radius divides the peak by 'glowOverlap^2' automatically, so total
// luminance is conserved -- no separate peak term is needed. Leaves are POINT
// sources with no box to spill past, so they select 1.0 and stay exactly as
// they were.

import package::starCatalog::io::VSOut;
import package::starCatalog::io::NodeParams;
import package::starCatalog::io::StarUniforms;
import package::starCatalog::tint::starTint;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::billboard::worldLenToPx;
import package::lib::starPhotometry::STAR_SIZE_REF_PX;
import package::lib::starPhotometry::STAR_GLOW_MIN_PX;
import package::lib::starPhotometry::STAR_GLOW_MAX_PX;
import package::lib::starPhotometry::D_REF_MPC;
import package::lib::starPhotometry::MIN_D2_MPC2;
import package::lib::starPhotometry::starPeakIntensity;
import package::lib::starPhotometry::toRefPx;
import package::lib::pickDepthBands::PICK_BAND_SURVEY_STAR_EPS;

@group(0) @binding(0) var<uniform> u: StarUniforms;
@group(1) @binding(0) var<storage, read> nodeParams: array<NodeParams>;
@group(1) @binding(1) var<storage, read> prefix: array<u32>;
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

// Visual-pass depth epsilon: pull the clamped clip-z this far inside the far
// plane so a point sitting exactly ON it still passes the clip test. Only the
// VISUAL pass uses this min-clamp — that pass is depthless additive and needs
// only the clip-survival property. The PICK pass instead FORCES the survey
// depth band (PICK_BAND_SURVEY_STAR_EPS, imported) so survey stars rank by
// importance, not distance — see the depth write at the end of 'vs'.
const CLIP_Z_EPS: f32 = 1e-4;

// Pick-pass clickable-footprint floor in px. A star sized honestly by the
// flux-glow math (STAR_GLOW_MIN_PX = 1.5, before the user's sizeScale) can land
// sub-pixel at deep zoom, so the visual dot may cover no pixel centre and the
// r32uint pick would miss it. When 'u.pickPass == 1u' the billboard radius is
// floored to this so every drawn star claims a small clickable patch AT ITS
// TRUE SCREEN POSITION (no brightness change -- the pick fragment ignores
// intensity, so only geometry is inflated). The visual pass leaves it a no-op:
// the floor is applied via a select() that resolves to 0.0 when pickPass == 0u,
// and max(rPx, 0.0) == rPx (rPx is always > 0), so the visual radius is
// byte-identical. Mirrors the galaxy points pick's clamp-to-'pointSizePx' floor.
const STAR_PICK_MIN_RADIUS_PX: f32 = 3.5; // 7 px diameter

// Near-sprite dissolve constants (visual pass only -- see the fade block in
// 'vs'). Close to a star, the f32 reconstruction 'originRelCamMpc + offset *
// cellScaleMpc' is a near-cancellation whose ulp error is AU-scale for
// parsec-scale cells, so at solar-radius framing distance the sprite visibly
// SWIMS by screen-widths. The nearest resolvable star gets a true-scale sphere
// composed in f64 instead (fieldStarSphereLayer), so the near sprite must
// dissolve as that sphere resolves. The fade keys on the star's WOULD-BE
// solar-diameter sphere size in px -- the same apparent-size quantity the
// sphere layer gates on ('apparentSizePx' vs 'STAR_RESOLVE_PX') -- so the
// handoff threshold is single-sourced with the layer the sprite hands off to,
// and the crossover stays seamless at EVERY viewport size. A fixed distance
// band would agree with that gate at exactly one viewport height + fov.
//
// TS twins (keep in sync -- same discipline as the dequant constants above):
//   SOLAR_RADIUS_MPC       = SOLAR_RADIUS_KM (696340, data/bodies/solarRadiusKm.ts)
//                            * KM_TO_MPC (data/scaleUnits.ts)
//   STAR_SPHERE_RESOLVE_PX = STAR_RESOLVE_PX
//                            (services/engine/frame/partitionStarsByResolution.ts)
const SOLAR_RADIUS_MPC: f32 = 2.25668425e-14;
const STAR_SPHERE_RESOLVE_PX: f32 = 4.0;
// Fade width: the sprite starts dissolving when the estimated sphere size
// crosses the resolve threshold and is fully gone at 4x it. Wide enough that
// the dissolve spans many frames of a focus descent (no visible pop), narrow
// enough that the sprite is long gone by framing distance (numbers in the
// fade block below).
const STAR_SPRITE_FADE_END_RATIO: f32 = 4.0;

// The sizing floor/ceiling + size reference, the inverse-square apparent-flux
// reference distance + its fly-through floor, the calibrated exposure baseline,
// and the peak-from-flux relation now live in lib/starPhotometry.wesl, shared
// with the famous / scene star vertex stage so the two render leaf stars
// pixel-identically. This stage imports them (above) and keeps only its
// aggregate-specific + record-unpack constants here.

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  // Route this instance to its owning draw slot: the largest 'slotLo' with
  // prefix[slotLo] <= ii (see the header). Bounded at 32 iterations — more than
  // log2 of any u32 draw count — so the loop always terminates on the GPU.
  let drawCount = arrayLength(&prefix);
  var slotLo = 0u;
  var slotHi = drawCount - 1u;
  for (var iter = 0u; iter < 32u; iter = iter + 1u) {
    if (slotLo >= slotHi) { break; }
    // Upper mid so slotLo can advance; invariant keeps prefix[slotLo] <= ii.
    let mid = (slotLo + slotHi + 1u) >> 1u;
    if (prefix[mid] <= ii) { slotLo = mid; } else { slotHi = mid - 1u; }
  }
  let node = nodeParams[slotLo];

  // Vertex-pull this instance's record: 'ii - prefix[slotLo]' is the in-node
  // record index; 'node.firstRecord' is the node's slice start. Two u32 per
  // record in the repacked blob.
  let base = node.firstRecord + (ii - prefix[slotLo]);
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
  // box extent only for aggregates ('node.isAggregate' != 0); a leaf gets
  // extent 0 -> floor. All scaled by the user's size slider (spread control;
  // luminance is invariant to radius -- header fact 2).
  let sizeScale = u.sizePx / STAR_SIZE_REF_PX;
  let extentMpc = select(0.0, node.cellScaleMpc, node.isAggregate != 0u);
  let boxRadiusPx = worldLenToPx(u.cam, extentMpc, center.w) * 0.5;
  // Glow overlap spreads AGGREGATE glows past their box footprint so the lattice
  // dissolves; leaves (point sources) select 1.0 and are untouched. Folded into
  // 'rPx' here, so the peak's /(K*rPx^2) below divides by 'glowOverlap^2' too --
  // total luminance stays conserved (header 'Glow overlap' + fact 2).
  let overlap = select(1.0, u.glowOverlap, node.isAggregate != 0u);
  // Floor first (legibility), then the size/overlap spread -- 'rPxRaw' is the
  // radius the luminance-conserving photometry wants. The absolute px CEILING
  // applies last and bounds only the DRAWN radius, so STAR_GLOW_MAX_PX caps
  // per-star fill at pi*MAX^2 regardless of 'sizeScale' or 'overlap'.
  let rPxRaw = max(STAR_GLOW_MIN_PX, boxRadiusPx) * sizeScale * overlap;
  let rPx = min(STAR_GLOW_MAX_PX, rPxRaw);

  // Peak from the UNCAPPED radius, converted to reference px (toRefPx) so the
  // formula conserves light per unit SOLID ANGLE across canvas sizes rather
  // than per device pixel: I_peak * K_GAUSS * rRefPx^2 == EXPOSURE * fluxApp.
  // Wherever the ceiling is not biting (rPx == rPxRaw -- every leaf and every
  // far aggregate) refining an aggregate or not deposits identical light per
  // unit solid angle. Once a NEAR aggregate's footprint outgrows
  // STAR_GLOW_MAX_PX, dividing by the still-growing rPxRaw^2 (in reference px)
  // rather than the pinned rPx^2 FREEZES its surface brightness at the value
  // it held when it hit the cap, instead of letting the peak climb as 1/d^2
  // into a saturated blob (the over-bright star bins around the Sun at
  // ~0.5-1.3 kpc camera distance, where near bins are radius-capped but not
  // yet refined to leaves). That is how a real extended source behaves --
  // approaching makes it BIGGER, not brighter per solid angle -- applied
  // consistently to a radius we truncate. Deposited light becomes EXPOSURE *
  // fluxApp * (rPx/rPxRaw)^2: a deliberate under-deposit for radius-capped
  // aggregates only (header 'Radius' note). 'u.brightness' is the user's
  // exposure trim ON TOP of the calibrated STAR_FLUX_EXPOSURE baseline (1.0 =
  // identity -- see the header). 'fluxApp' is the inverse-square-dimmed
  // apparent flux (header 'Apparent flux'). The peak-from-flux relation is
  // shared with the famous / scene star stage (lib/starPhotometry.wesl).
  let intensityRaw = starPeakIntensity(u.brightness, fluxApp, toRefPx(rPxRaw, u.cam.viewportPx.y));

  // Aggregate surface-brightness cap -- the user's live 'Fog cap' setting
  // ('u.aggregateIntensityCap', settings.starCatalogs.aggregateIntensityCap). A
  // near sub-threshold aggregate deposits its subtree's honest summed light as a
  // box-filling glow; around the Sun (~0.5-1.3 kpc camera distance) that reads as
  // jarring luminous fog. Clamp the PEAK (per-pixel surface brightness) of
  // AGGREGATE records only -- leaves stay uncapped so bright resolved stars still
  // bloom. Aggregate-only because the fog is a property of the box-filling glow a
  // leaf point source never has. Deliberately NON-physical: light above the
  // ceiling is DISCARDED, not conserved -- the flux-conserving route (spreading
  // the excess into a wider dot, as 'glowOverlap' does) is what makes the fog in
  // the first place, since the offending glow is already box-sized.
  let intensity = select(
    intensityRaw,
    min(intensityRaw, u.aggregateIntensityCap),
    node.isAggregate != 0u
  );

  // Near-sprite dissolve -- retire the wobbling sprite as its would-be sphere
  // resolves (constants block above). Why fade ANY near record and not just the
  // focused star: the wobble is a property of PROXIMITY (the f32
  // near-cancellation at 'worldRelCam'), so this distance-keyed fade targets
  // exactly the set that swims -- leaves and aggregates alike -- and needs no
  // per-focus uniform. A focused-record match would be more precise but adds a
  // field to StarUniforms, the packing surface a concurrent layout refactor
  // owns; the local band covers the case without that coupling. Accepted
  // trade-off: free-flying into a NON-focused star's band fades its sprite with
  // no sphere to replace it -- AU-proximity is reached essentially only by
  // focus-framing, so the transient gap is unobtrusive.
  //
  // 'worldLenToPx' under-reports the true apparent size by tan(fovY/2) (it has
  // no access to the fov, only clip.w + viewport; at the app's fixed 60-degree
  // fov that is x0.58), so the fade begins only once the TRUE sphere size is
  // ~1.7x the resolve threshold -- the sphere is always resolved BEFORE the
  // sprite starts dissolving (the safe direction for any fov below 90 degrees).
  // At a 1080 px viewport the band runs from ~1.3 AU (fade start) to ~0.3 AU
  // (sprite gone), well outside the ~0.02 AU focus-framing distance.
  //
  // The peak intensity above stays on the UNFADED 'rPx': deposited light then
  // falls as spriteFade^2 (fixed peak, shrinking area) -- a smooth dim-out.
  // Folding the fade into the peak's radius instead would CONSERVE luminance
  // into an ever-brighter shrinking dot that pops out at zero. Outside the band
  // smoothstep returns 0, 'spriteFade' is 1.0, and 'rPx * 1.0 == rPx' exactly
  // -- the visual math is untouched there. The pick pass selects 1.0
  // unconditionally, so a near star stays clickable at close range.
  let sphereDiamPx = worldLenToPx(u.cam, 2.0 * SOLAR_RADIUS_MPC, center.w);
  let fadeIn = smoothstep(
    STAR_SPHERE_RESOLVE_PX,
    STAR_SPHERE_RESOLVE_PX * STAR_SPRITE_FADE_END_RATIO,
    sphereDiamPx
  );
  let spriteFade = select(1.0 - fadeIn, 1.0, u.pickPass == 1u);
  let rPxVisual = rPx * spriteFade;

  // Pick pass only: floor the BILLBOARD radius so a sub-pixel star still covers
  // a clickable pixel at its true screen position. The floor rides a select()
  // that is 0.0 in the visual pass, and max(rPxVisual, 0.0) == rPxVisual, so
  // the visual geometry is byte-identical -- only the pick draw inflates. The
  // peak above stays on the UNCLAMPED rPx: the pick fragment ignores intensity,
  // and leaving the visual peak untouched keeps the two paths provably disjoint.
  let pickFloorPx = select(0.0, STAR_PICK_MIN_RADIUS_PX, u.pickPass == 1u);
  let rPxDraw = max(rPxVisual, pickFloorPx);

  let screenOffset = expandBillboardScreen(u.cam, center, rPxDraw, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(screenOffset, 0.0, 0.0);

  // Depth write — the two passes diverge here (header 'lib/pickDepthBands').
  //
  // VISUAL pass: survive the adaptive foreground far plane on a deep descent by
  // pulling clip-z just inside it. That pass is depthless additive (no depth
  // test/write), so this min-clamp perturbs no depth compare; it only keeps a
  // beyond-far sprite from being clipped away.
  //
  // PICK pass: this stage IS depth tested, and the user wants IMPORTANCE order,
  // not distance order — a Gaia field star a parsec in front of a famous star
  // must NOT steal its click. So instead of the true-depth clamp we FORCE every
  // survey star onto the survey band 'z = w * PICK_BAND_SURVEY_STAR_EPS'.
  // That band sits BELOW the scene-star band (smaller eps → smaller z/w →
  // loses 'greater'), so survey stars always lose to scene/famous stars, glints
  // and spheres, and sit above only the Milky Way backdrop band. Consequence: two
  // overlapping survey stars tie on this one constant depth, so the leaf-walk draw
  // order decides between them — acceptable because 'nearest of two overlapping
  // dots in a dense 7 px field' carries no user meaning, whereas 'famous star
  // beats the field behind it' does.
  out.clip.z = select(
    min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS)),
    out.clip.w * PICK_BAND_SURVEY_STAR_EPS,
    u.pickPass == 1u
  );

  out.uv = corner;

  // Dequant BP−RP colour (bin centre) → stellar spectral tint.
  let bpRp = STAR_COLORIDX_MIN + (f32(colorIdx) + 0.5) * STAR_COLORIDX_STEP;
  out.color = starTint(bpRp);
  out.opacity = node.opacity;
  out.intensity = intensity;
  // The record's bin-global index (its slice base + in-node index), already
  // computed above as 'base' to vertex-pull the record. The pick fragment packs
  // it into the r32uint texture; 'resolveStarRecord' inverts it back to the star.
  out.recordIdx = base;
  return out;
}
