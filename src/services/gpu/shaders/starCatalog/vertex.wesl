// starCatalog/vertex.wesl — vertex-pull billboard stage for the survey (Gaia
// bin) stars. Derivation-heavy file: the header carries the photometry.
//
// One instance = one octree record (a leaf star, or an interior node's flux-mip
// aggregate). cut.wesl leaves a draw list per stream; an instance finds its node
// from its place in that list with no search, rebuilds the node's
// camera-relative box from the static node table, and pulls its record from the
// per-source blob. Bindings: @group(0) u (rebased view-projection + viewport),
// @group(1) cut* (cutIo.wesl structs and this stream's list), @group(2) records.
//
// ## Record unpack (the inverse of packStarRecord)
//
// The on-disk 6-byte record is two independent 24-bit halves (JS bitwise ops are
// signed-32; see starCatalogFormat.ts). The renderer repacks each into two u32,
// 'lo' = bytes 0..2 and 'hi' = bytes 3..5:
//
//   offsetX = lo bits 0..9      offsetY = lo bits 10..19
//   offsetZ = lo bits 20..23 (low 4) | hi bits 0..5 (high 6)   <- the straddle trap
//   absMagIdx = hi bits 6..12 (7)   colorIdx = hi bits 13..18 (6)
//
// ## World reconstruction
//
// cutIo.wesl's camera split makes node-minus-camera integer-exact, so the origin
// arrives small and the f32 math is well-conditioned:
//   worldRelCam = originRelCamMpc + (offset / 1024) * cellScaleMpc
//
// ## Flux-integrated glow
//
// Target: an aggregate deposits the same integrated luminance as the children it
// stands for, so an LOD transition is photometrically invisible.
//
//   1. Flux is additive. flux = 10^(-0.4 * absMag) dequantizes the record's
//      magnitude. An aggregate stores its subtree's MEAN star flux
//      (mergeFluxAggregate stores -2.5*log10(sum/N)), because a summed
//      magnitude of thousands of stars is 10+ mag past the LUT's single-star
//      floor and would clamp (a box lattice, and a flux jump at refine).
//      Multiplying by 'subtreeStarCount' (1.0 for a leaf) recovers the summed
//      light: EXPOSURE * mean * N equals the sum of the children's
//      EXPOSURE * flux, and the cut is a covering partition, so nothing counts
//      twice. Exact below the knee; across it the concave rolloff makes the
//      refined sum slightly brighter, an accepted seam wobble in bright cores,
//      the price of preserving hue (fragment.wesl).
//
//   2. A Gaussian dot of peak I and pixel radius rPx deposits I * rPx^2 *
//      K_GAUSS (the integral over the unit disc of the rim-zeroed profile; see
//      lib/starPhotometry.wesl, fragment.wesl). Setting
//      I = EXPOSURE * fluxApp / (K_GAUSS * rPx^2) makes total luminance
//      invariant to rPx, which only chooses a bright core or a soft glow.
//
// ## Apparent flux: inverse-square dimming
//
// LUT flux is intrinsic; depositing it undimmed blows the far field white.
//   fluxApp = flux * D_REF_MPC^2 / max(d2, MIN_D2_MPC2)
// where d2 is the record's squared camera distance (Mpc^2), taken from
// worldRelCam before corner expansion.
//   D_REF_MPC = 1e-5 Mpc = 10 pc, where absolute magnitude is defined: the factor
//     is 1 at 10 pc.
//   MIN_D2_MPC2 = (1e-7)^2 = (0.1 pc)^2 floors d2 against the fly-through pole,
//     which would flash the frame white; no real view gets that close.
// f32 range: the brightest aggregate flux ~2.5e9 times D_REF^2 = 1e-10 is ~0.25
// before the /d2, which only shrinks it; a faint far leaf underflows harmlessly,
// its light is in an ancestor aggregate.
//
// ## Radius
//
// A leaf is a point source: its radius is a legibility floor. An aggregate is
// extended: its radius grows to its box's on-screen footprint (worldLenToPx of
// the box edge), so adjacent far glows meet edge to edge. 'isAgg' comes from the
// node's childMask, not its octree level (a fat leaf sits at level > 0 yet is a
// leaf); a select picks the box extent, 0 for leaves. The user's sizePx slider
// scales it, a spread control that leaves total luminance alone (fact 2).
//
// One deliberate exception to fact 2: STAR_GLOW_MAX_PX bounds only the DRAWN
// radius while the peak divides by the UNCAPPED one, so a near aggregate whose
// footprint outgrows the ceiling freezes at the surface brightness it held at
// the cap and under-deposits by (rPx/rPxRaw)^2, rather than concentrating its
// growing 1/d^2 flux into a saturated fixed-size blob.
//
// ## Brightness and glow overlap
//
// Deposited luminance is STAR_FLUX_EXPOSURE (the eye-tuned baseline) *
// u.brightness * fluxApp, so brightness changes the total, unlike sizePx.
// u.glowOverlap multiplies the AGGREGATE radius so glows spill past their box
// and melt the box lattice; folded into the radius, it divides the peak by
// glowOverlap^2 and luminance is conserved. Leaves select 1.0.

import package::starCatalog::io::VSOut;
import package::starCatalog::io::StarUniforms;
import package::starCatalog::cutIo::CutNode;
import package::starCatalog::cutIo::CutUniforms;
import package::starCatalog::cutIo::CutStream;
import package::starCatalog::cutIo::nodeEdgeCells;
import package::starCatalog::cutIo::nodeIsAggregate;
import package::starCatalog::cutIo::nodeRecordCount;
import package::starCatalog::cutIo::nodeMinCells;
import package::starCatalog::cutIo::leafEntryNode;
import package::starCatalog::cutIo::leafEntryBlock;
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
import package::lib::focusUniforms::FocusUniforms;
import package::lib::focusUniforms::focusAlphaMultiplier;
import package::lib::focusUniforms::FOCUS_PICK_EXCLUDE_BELOW;

@group(0) @binding(0) var<uniform> u: StarUniforms;
@group(1) @binding(0) var<uniform> cut: CutUniforms;
@group(1) @binding(1) var<storage, read> cutNodes: array<CutNode>;
@group(1) @binding(2) var<storage, read> cutOpacity: array<f32>;
@group(1) @binding(3) var<storage, read> cutList: array<u32>;
@group(1) @binding(4) var<uniform> cutStream: CutStream;
@group(2) @binding(0) var<storage, read> records: array<u32>;

// Dequant constants, mirroring the frozen windows in
// src/data/starCatalog/starCatalogFormat.ts (never diverge):
//   lutIndexToAbsMag(i) = STAR_ABSMAG_MIN + (i + 0.5) * STAR_ABSMAG_STEP
//   colorIdxToBpRp(i)   = STAR_COLORIDX_MIN + (i + 0.5) * STAR_COLORIDX_STEP
const STAR_ABSMAG_MIN: f32 = -6.0;
const STAR_ABSMAG_STEP: f32 = 0.19;
const STAR_COLORIDX_MIN: f32 = -0.6;
// (4.4 - (-0.6)) / 64
const STAR_COLORIDX_STEP: f32 = 0.078125;

// Reciprocal of 1024: offset 0..1023 spans one box.
const OFFSET_SCALE: f32 = 0.0009765625;

// Pick pass only: floors the billboard radius so a sub-pixel star still covers a
// clickable pixel at its true screen position. Geometry only; the pick fragment
// ignores intensity.
const STAR_PICK_MIN_RADIUS_PX: f32 = 3.5;

// Near-sprite dissolve (visual pass only). Close to a star the f32 sum
// 'originRelCamMpc + offset * cellScaleMpc' is a near-cancellation with AU-scale
// ulp error for parsec-scale cells, so the sprite swims by screen-widths. The
// nearest resolvable star gets a true-scale sphere composed in f64
// (fieldStarSpherePass), so the sprite dissolves as that sphere resolves. The
// fade keys on the star's would-be solar-diameter sphere size in px, the quantity
// the sphere layer gates on, so the hand-off is single-sourced and seamless at
// every viewport size.
//
// TS twins (keep in sync):
//   SOLAR_RADIUS_MPC       = SOLAR_RADIUS_KM (data/bodies/solarRadiusKm.ts)
//                            * KM_TO_MPC (data/scaleUnits.ts)
//   STAR_SPHERE_RESOLVE_PX = STAR_RESOLVE_PX
//                            (services/engine/frame/partitionStarsByResolution.ts)
const SOLAR_RADIUS_MPC: f32 = 2.25668425e-14;
const STAR_SPHERE_RESOLVE_PX: f32 = 4.0;
// worldLenToPx reports the true apparent size (lib/camera.wesl's pxPerRad); the
// 1/tan(30 degrees) factor places the hand-off where the app's 60 degree fov
// puts it. The TS twin is the bare threshold.
const STAR_SPHERE_FADE_START_PX: f32 = STAR_SPHERE_RESOLVE_PX * 1.73205;
// 0.5 turns the box edge's full on-screen span into a dot radius; tan(30
// degrees) matches the 60 degree fov as above.
const AGGREGATE_BOX_RADIUS_FACTOR: f32 = 0.5 * 0.57735;
// The sprite is fully gone at this multiple of the fade start: wide enough that
// the dissolve spans many frames of a focus descent, narrow enough that the
// sprite is long gone by framing distance.
const STAR_SPRITE_FADE_END_RATIO: f32 = 4.0;

// 'cutStream.blockShift' is 3 for the leaf list (blocks of 8 instances per
// entry) and 0 for the aggregate list (one instance per entry).
@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  let shift = cutStream.blockShift;
  let entry = cutList[ii >> shift];
  let nodeIdx = leafEntryNode(entry);
  let bits = cutNodes[nodeIdx].bits;
  let local = (leafEntryBlock(entry) << shift) | (ii & ((1u << shift) - 1u));
  if (local >= nodeRecordCount(bits)) {
    // A spare instance of the node's last block: outside the clip volume.
    var skip: VSOut;
    skip.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return skip;
  }
  let isAgg = nodeIsAggregate(bits);
  let originRelCamMpc = nodeMinCells(cutNodes[nodeIdx].grid, cut.camCell, cut.camFrac) * cut.cellEdgeMpc;
  let cellScaleMpc = nodeEdgeCells(bits) * cut.cellEdgeMpc;
  let base = cutNodes[nodeIdx].firstRecord + local;
  let nodeOpacity = cutOpacity[nodeIdx] * cut.opacity;
  let subtreeStarCount = select(1.0, f32(cutNodes[nodeIdx].subtreeCount), isAgg);

  // Two u32 per record in the repacked blob.
  let lo = records[base * 2u + 0u];
  let hi = records[base * 2u + 1u];

  let ox = f32(lo & 0x3ffu);
  let oy = f32((lo >> 10u) & 0x3ffu);
  let oz = f32(((lo >> 20u) & 0xfu) | ((hi & 0x3fu) << 4u));
  let absMagIdx = (hi >> 6u) & 0x7fu;
  let colorIdx = (hi >> 13u) & 0x3fu;

  let offset = vec3<f32>(ox, oy, oz) * OFFSET_SCALE;
  let worldRelCam = originRelCamMpc + offset * cellScaleMpc;

  let d2 = dot(worldRelCam, worldRelCam);
  let atten = (D_REF_MPC * D_REF_MPC) / max(d2, MIN_D2_MPC2);

  let center = worldToClip(u.cam, worldRelCam);
  let corner = triCorner(vi);

  let absMag = STAR_ABSMAG_MIN + (f32(absMagIdx) + 0.5) * STAR_ABSMAG_STEP;
  let flux = pow(10.0, -0.4 * absMag) * subtreeStarCount;
  let fluxApp = flux * atten;

  let sizeScale = u.sizePx / STAR_SIZE_REF_PX;
  let extentMpc = select(0.0, cellScaleMpc, isAgg);
  let boxRadiusPx = worldLenToPx(u.cam, extentMpc, center.w) * AGGREGATE_BOX_RADIUS_FACTOR;
  let overlap = select(1.0, u.glowOverlap, isAgg);
  // Floor first, then the size/overlap spread: 'rPxRaw' is the radius the
  // luminance-conserving photometry wants. The absolute ceiling applies last and
  // bounds only the DRAWN radius.
  let rPxRaw = max(STAR_GLOW_MIN_PX, boxRadiusPx) * sizeScale * overlap;
  let rPx = min(STAR_GLOW_MAX_PX, rPxRaw);

  // Peak from the UNCAPPED radius in reference px (toRefPx), so light is
  // conserved per unit solid angle across canvas sizes: I_peak * K_GAUSS *
  // rRefPx^2 == EXPOSURE * fluxApp (header, 'Radius' exception).
  let intensityRaw = starPeakIntensity(u.brightness, fluxApp, toRefPx(rPxRaw, u.pxPerRad));

  // Aggregate surface-brightness cap, the user's 'Fog cap': a near
  // sub-threshold aggregate deposits its honest summed light as a box-filling
  // glow that reads as fog around the Sun. Leaves stay uncapped so bright
  // resolved stars still bloom. Deliberately non-physical: light above the
  // ceiling is discarded, since spreading it wider (as glowOverlap does) is what
  // makes the fog.
  let intensity = select(
    intensityRaw,
    min(intensityRaw, u.aggregateIntensityCap),
    isAgg
  );

  // Focus dim: stars outside a focused structure's sphere recede by the rule the
  // survey galaxies use, at this record's own position (an aggregate dims by its
  // box record, so the half-res glow dims too). Exactly 1.0 at rest.
  let focus = FocusUniforms(
    vec4<f32>(u.focusCenterRelCam, u.focusApparentRadiusMpc),
    u.focusBlend,
    u.focusPhysicalRadiusMpc,
    0.0,
    0.0,
  );
  let focusMult = focusAlphaMultiplier(worldRelCam, focus);

  // Near-sprite dissolve (constants above). It fades ANY near record, not just
  // the focused star's: the swim is a property of proximity, so a distance-keyed
  // fade targets exactly the set that swims and needs no per-focus uniform. A
  // free-flown approach to a non-focused star fades its sprite with no sphere to
  // replace it, but AU proximity is reached essentially only by focus-framing.
  // The fade starts once the sphere is ~1.7x the resolve threshold, so the sphere
  // is always resolved first; at 1080 px it runs from ~1.3 AU (start) to ~0.3 AU
  // (gone), well outside the ~0.02 AU framing distance.
  //
  // The peak stays on the UNFADED rPx, so deposited light falls as spriteFade^2
  // (fixed peak, shrinking area), a smooth dim-out; folding the fade into the
  // peak's radius would conserve luminance into a brighter dot that pops out at
  // zero. Outside the band spriteFade is exactly 1.0. The pick pass selects 1.0,
  // so a near star stays clickable.
  let sphereDiamPx = worldLenToPx(u.cam, 2.0 * SOLAR_RADIUS_MPC, center.w);
  let fadeIn = smoothstep(
    STAR_SPHERE_FADE_START_PX,
    STAR_SPHERE_FADE_START_PX * STAR_SPRITE_FADE_END_RATIO,
    sphereDiamPx
  );
  let spriteFade = select(1.0 - fadeIn, 1.0, u.pickPass == 1u);
  let rPxVisual = rPx * spriteFade;

  // Pick pass only: the floor rides a select that is 0.0 in the visual pass, and
  // max(rPxVisual, 0.0) == rPxVisual, so visual geometry is byte-identical.
  let pickFloorPx = select(0.0, STAR_PICK_MIN_RADIUS_PX, u.pickPass == 1u);
  let rPxDraw = max(rPxVisual, pickFloorPx);

  let screenOffset = expandBillboardScreen(u.cam, center, rPxDraw, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(screenOffset, 0.0, 0.0);

  // Depth. VISUAL pass: the true clip-z (depthless additive, reversed-Z
  // infinite-far slab). PICK pass is depth tested and wants IMPORTANCE order, not
  // distance: a Gaia field star must not steal a click from a famous star a
  // parsec behind it. Every survey star is forced onto the band
  // 'z = w * PICK_BAND_SURVEY_STAR_EPS', below the scene-star band, so it loses
  // to scene and famous stars, glints and spheres and sits above only the Milky
  // Way backdrop. Within the band the apparently brighter star wins, because the
  // cut lists nodes in no fixed order and a constant depth would let the draw
  // order pick between overlapping dots. The rank spreads the band over
  // [1, 1.9) x eps, under the scene band at 2 x eps; log2 of apparent flux spans
  // about -100..+21, so (log2 + 100) / 128 stays inside [0, 1].
  let pickRank = 0.9 * clamp((log2(max(fluxApp, 1e-30)) + 100.0) / 128.0, 0.0, 1.0);
  let pickZ = out.clip.w * PICK_BAND_SURVEY_STAR_EPS * (1.0 + pickRank);
  out.clip.z = select(out.clip.z, pickZ, u.pickPass == 1u);

  // A star the focus dims is not hit-testable, as for the survey galaxies.
  if (u.pickPass == 1u && focusMult < FOCUS_PICK_EXCLUDE_BELOW) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }

  out.uv = corner;

  let bpRp = STAR_COLORIDX_MIN + (f32(colorIdx) + 0.5) * STAR_COLORIDX_STEP;
  out.color = starTint(bpRp);
  out.opacity = nodeOpacity;
  out.intensity = intensity * focusMult;
  out.recordIdx = base;
  return out;
}
