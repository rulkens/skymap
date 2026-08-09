/**
 * packFieldUniforms — the packers for the analytic Milky Way field pass,
 * matching `milkyWay/field/io.wesl`'s `FieldUniforms` header and `comps`
 * storage array byte-for-byte. THAT FILE'S HEADER IS THE OFFSET AUTHORITY; a
 * wrong index here produces no error, just silently garbage uniforms.
 *
 * Two packers, not one, because the header and the components change at
 * different rates: `packFieldHeaderUniforms` runs every `drawFrame` (its
 * `exposure` lane tracks the per-frame visibility fade), while
 * `packFieldComponents` only needs to run when a mixture actually changes —
 * a galaxy (re)generated, an extra set replaced, or the field tuning
 * dragged. Baking both into one packed buffer, as this module used to,
 * meant repacking every background galaxy's Gaussians on every frame for no
 * reader. The split also drops the component cap a uniform array forced: the
 * old layout's 64 KiB uniform held at most ~1000 components (~3 galaxies'
 * worth); `comps` is now a read-only storage array with no such ceiling, so
 * N background extras can outgrow it (`createGalaxyModel.ts` sizes and
 * grows the backing GPUBuffer; `GALAXY_FIELD_MAX_COMPONENTS` remains only
 * the PER-GALAXY cap `buildGalaxyFieldMixture` enforces).
 *
 * ## Why a camera BASIS and not an inverse view-projection
 *
 * The shader needs a world-space ray per fragment. Both routes work; this one
 * is the least invasive, because every input already exists in the frame loop:
 * the camera's world right/up rows come off the view matrix exactly as
 * `packCloudUniforms` reads them for the billboards, the forward axis is the
 * negated third row, and fov/aspect/lens-shift are the arguments the engine
 * just built its projection from. An inverse-VP route would add a matrix
 * inverse per frame plus the [0,1]-vs-[-1,1] depth bookkeeping, to reconstruct
 * numbers the engine had in hand a line earlier.
 *
 * The lens shift is passed through because the engine writes one into
 * `proj[8]` to keep the galaxy centred in the panel-free part of the canvas.
 * That term subtracts from x_ndc, so the shader adds it back; omitting it
 * would slide the analytic field against the sprites whenever a side panel
 * opens — a divergence that looks like a projection bug, not a framing one.
 */

import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { FieldDust } from '../../../@types/engine/FieldDust';
import type { FieldHeaderInput } from '../../../@types/engine/FieldHeaderInput';
import type { HiiTextureLanes } from '../../../@types/engine/HiiTextureLanes';
import type { IsmMapSeedingLanes } from '../../../@types/engine/IsmMapSeedingLanes';
import type { YoungStarsLanes } from '../../../@types/engine/YoungStarsLanes';

/** Float count of `io.wesl`'s `FieldUniforms` header — 16 vec4, camera + params + counts + counts2 + dustExtinction + dustNoise + dustSlices + debugView + ismMapChannels + bubbleView + dustDetail + dustCarve + youngStars. */
export const FIELD_HEADER_FLOATS = 64;

/** Byte size of the header struct, for `createBuffer`. */
export const FIELD_HEADER_BUFFER_SIZE = FIELD_HEADER_FLOATS * 4;

/** Floats per `comps` entry — four vec4, as `io.wesl`'s layout comment documents. */
export const FIELD_COMPONENT_FLOATS = 16;

/**
 * "This pass has no dust", as a VALUE rather than a skipped write — see the
 * pack below for why skipping is a stale-bytes bug. `tileUnits` and
 * `contrastExp` are 1, not 0: dustMap.wesl divides by the first and raises
 * `pow` to the second.
 */
const INERT_DUST: FieldDust = {
  count: 0,
  extinctionRgb: [0, 0, 0],
  noise: { tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 },
  // `carve: 0` is the mandatory identity (dustMap.wesl branches out); the
  // other two lanes are unread in that case, but named at their own
  // identity values rather than 0 so a future reader never has to ask.
  carve: { carve: 0, sharpness: 0.5, stretch: 1 },
  slices: { t1: 0, t2: 0, t3: 0 },
  mapHeightPx: 0,
  // A pass with no dust has nothing for the map to modulate.
  detail: 0,
};

/**
 * "This pass draws no HII texture" — scale 0 is what lets splat.wesl's fs
 * skip the noise sample on a uniform branch (see `FieldHeaderInput`'s
 * `hiiTexture` doc); contrast 1 is inert but never read while scale gates
 * the branch closed.
 */
const NO_HII_TEXTURE: HiiTextureLanes = { scale: 0, contrast: 1 };

/** "This pass has no seeding overlay" — the HII header packs this; only the field header (ismMapPresent.wesl's own bind group) ever passes real lanes. `cap: 0` matches `dustPlacementCap`'s own "0 = uncapped" default. */
const INERT_ISM_MAP_SEEDING: IsmMapSeedingLanes = { weight: 0, cap: 0, globalMean: 0 };

/**
 * "This pass draws no young-stars chain" — `contrastGamma`/`invMeanNorm` are
 * neutral (not zero), since splat.wesl's `pow`/multiply would otherwise turn
 * a stray nonzero `starsWeight` into a black hole rather than a no-op; only
 * the HII header ever passes real lanes (`model.youngStars`).
 * `nearFadeStart`/`nearFadeEnd` are 0/0 instead — the field draw's own gate
 * (`u.dustDetail.y > 0.0`) already keeps this pass's fade branch closed, but
 * 0 is also splat.wesl's own "fade disabled" guard value, so a stray read
 * degrades to no-op rather than a bogus window.
 */
const NO_YOUNG_STARS: YoungStarsLanes = {
  contrastGamma: 1,
  invMeanNorm: 1,
  nearFadeStart: 0,
  nearFadeEnd: 0,
};

/**
 * packFieldHeaderUniforms — one 240-byte `FieldUniforms` header, every lane
 * written every call. `dst` is a per-frame scratch shared across headers
 * (createGalaxyEngine's `fieldData`/`hiiData`), so a lane left unwritten
 * silently ships the previous pass's bytes to the GPU — which is why an
 * absent `dust` falls back to `INERT_DUST` instead of skipping its writes.
 */
export function packFieldHeaderUniforms(input: FieldHeaderInput, dst?: Float32Array): Float32Array {
  const {
    camera: cam,
    emissionCount,
    primaryCount,
    targetSizePx,
    debugViews,
    galaxyWeight,
    ismMapChannels,
  } = input;
  const dust = input.dust ?? INERT_DUST;
  const hiiTexture = input.hiiTexture ?? NO_HII_TEXTURE;
  const ismMapSeeding = input.ismMapSeeding ?? INERT_ISM_MAP_SEEDING;
  const youngStars = input.youngStars ?? NO_YOUNG_STARS;
  const out = dst ?? new Float32Array(FIELD_HEADER_FLOATS);
  const { view } = cam;

  // eye 0..3.
  out[0] = cam.eye[0];
  out[1] = cam.eye[1];
  out[2] = cam.eye[2];
  out[3] = 0;

  // camRight 4..7, camUp 8..11, camFwd 12..15. A lookAt view matrix's rotation
  // ROWS are the camera's world axes (the transpose of an orthonormal
  // rotation); wgpu-matrix stores column-major, so each row is a stride-4
  // gather. Row 2 points AWAY from the target, hence the negation.
  out[4] = view[0]!;
  out[5] = view[4]!;
  out[6] = view[8]!;
  out[7] = 0;
  out[8] = view[1]!;
  out[9] = view[5]!;
  out[10] = view[9]!;
  out[11] = 0;
  out[12] = -view[2]!;
  out[13] = -view[6]!;
  out[14] = -view[10]!;
  out[15] = 0;

  // params 16..19 = (tanHalfFov, aspect, lensShiftX, exposure).
  out[16] = Math.tan(cam.fov / 2);
  out[17] = cam.aspect;
  out[18] = cam.lensShiftX;
  out[19] = cam.exposure;

  // counts 20..23 = (emissionCount, dustOffset, dustCount, primaryCount).
  // dustOffset is not an input: dust is always appended AFTER every emission
  // component, so the slice starts exactly at `emissionCount` (io.wesl).
  out[20] = emissionCount;
  out[21] = emissionCount;
  out[22] = dust.count;
  out[23] = primaryCount;

  // counts2 24..27 = (unused, dustMapHeightPx, targetWidthPx, targetHeightPx).
  out[24] = 0;
  out[25] = dust.mapHeightPx;
  out[26] = targetSizePx[0];
  out[27] = targetSizePx[1];

  // dustExtinction 28..31 = (A_lambda/A_V per channel, unused).
  out[28] = dust.extinctionRgb[0];
  out[29] = dust.extinctionRgb[1];
  out[30] = dust.extinctionRgb[2];
  out[31] = 0;

  // dustNoise 32..35 = (tileUnits, amplitude, cloudOffset, contrastExp).
  out[32] = dust.noise.tileUnits;
  out[33] = dust.noise.amplitude;
  out[34] = dust.noise.cloudOffset;
  out[35] = dust.noise.contrastExp;

  // dustSlices 36..39 = (t1, t2, t3, unused).
  out[36] = dust.slices.t1;
  out[37] = dust.slices.t2;
  out[38] = dust.slices.t3;
  out[39] = 0;

  // debugView 40..43 = (dust, ismMap, orientation, galaxyWeight). Hand-written
  // lane by lane, NOT iterated over `debugViews`: a loop would hang a GPU byte
  // layout on JS object key order, so reordering two `DEBUG_VIEWS` rows would
  // silently swap orientation with bubble. The four views do NOT share one
  // vec4 — .w is the galaxy weight, so `bubble` gets a vec4 of its own below.
  out[40] = debugViews.dust;
  out[41] = debugViews.ismMap;
  out[42] = debugViews.orientation;
  out[43] = galaxyWeight;

  // ismMapChannels 44..47 = (gasWeight, recentSfWeight, activityWeight, dustWeight).
  out[44] = ismMapChannels.gasWeight;
  out[45] = ismMapChannels.starsWeight;
  out[46] = ismMapChannels.activityWeight;
  out[47] = ismMapChannels.dustWeight;

  // bubbleView 48..51 = (intensity, ismMapSeedingWeight, ismMapSeedingCap,
  // ismMapSeedingGlobalMean). .y/.z/.w ride bubbleView's free lanes for the
  // same reason dustDetail's .yz do (io.wesl's doc) — ismMapPresent.wesl's
  // "seeding" debug view, dust-seeding spike. .z used to be
  // ismMapSeedingMeanLegacy, freed when the seeding view's legacy term was
  // deleted, then briefly a tempering exponent (gamma) that the placement
  // formula no longer has (deleted for a single knob — placement CAP —
  // instead); it carries that cap now. .w is the mean of the map's own
  // per-ring dust means (`arrayMean(ismMapRingMeans(...))`, `createGalaxyModel.ts`'s
  // `ismMapSeedingView` getter), the divisor of the radial-envelope term
  // BOTH sides of the CDF density share — see io.wesl's own doc and
  // dustParticleCloud.ts's placement comment for why per-RING, not one flat
  // map-wide mean, is what keeps the cap from also flattening the radial
  // profile. The per-ring means themselves ride a separate storage buffer
  // (createIsmMapOutput.ts's ringMeansBuffer/writeRingMeans) — 512 floats has
  // no home in a vec4.
  out[48] = debugViews.bubble;
  out[49] = ismMapSeeding.weight;
  out[50] = ismMapSeeding.cap;
  out[51] = ismMapSeeding.globalMean;

  // dustDetail 52..55 = (strength, hiiTextureScale, hiiTextureContrast,
  // spare). .y/.z are unrelated to S4's own strength lane — they ride this
  // vec4's two free lanes for the HII tier's tier-global texture modulation
  // (io.wesl's dustDetail doc); NO_HII_TEXTURE's scale 0 is what lets
  // splat.wesl's fs skip the noise sample on a uniform branch for every pass
  // but the HII one. .w was dustDetail.wesl's legacy/swept blend weight,
  // then briefly the seeding view's placement cap before that moved back
  // into bubbleView.z (freed once the view's gamma lane was deleted) —
  // spare again, still written every frame (packFieldHeaderUniforms's
  // no-stale-lanes contract), just always 0.
  out[52] = dust.detail;
  out[53] = hiiTexture.scale;
  out[54] = hiiTexture.contrast;
  out[55] = 0;

  // dustCarve 56..59 = (carve, sharpness, stretch, spare). S5 (io.wesl's own
  // doc) — carve <= 0 is dustMap.wesl's mandatory identity branch, so the
  // other two lanes are inert-but-harmless whenever `dust` is `INERT_DUST`.
  out[56] = dust.carve.carve;
  out[57] = dust.carve.sharpness;
  out[58] = dust.carve.stretch;
  out[59] = 0;

  // youngStars 60..63 = (contrastGamma, invMeanNorm, nearFadeStart,
  // nearFadeEnd). Only the HII header ever passes real values (`youngStars`'s
  // own doc) — the field header's `NO_YOUNG_STARS` default is neutral (1, 1)
  // for the first two lanes, since splat.wesl's fs only ever reaches them
  // behind `g3.w > 0.0`, a gate the field draw's own components never open;
  // the fade lanes default to 0 (`?? 0`), splat.wesl's own "disabled" value.
  out[60] = youngStars.contrastGamma;
  out[61] = youngStars.invMeanNorm;
  out[62] = youngStars.nearFadeStart ?? 0;
  out[63] = youngStars.nearFadeEnd ?? 0;

  return out;
}

/**
 * packFieldComponents — one galaxy-agnostic flat list of components (the
 * caller concatenates the central galaxy's emission mixture, every extra's
 * — already transformed into world space, see `transformGalaxyFieldComponent.ts`
 * — then the central galaxy's dust mixture last) into the storage buffer's
 * bytes. Unlike the old uniform packer, there is no tail to zero: bytes past
 * `mixture.length` are never read even when the backing GPUBuffer's capacity
 * (grown, never shrunk) is larger. The draw call instances `emissionCount`
 * quads, NOT `mixture.length` — dust components ride this same buffer but
 * are read only from inside a primary emission fragment (splat.wesl's `fs`),
 * never drawn as their own quad.
 */
export function packFieldComponents(
  mixture: readonly GalaxyFieldComponent[],
  dst?: Float32Array,
): Float32Array {
  const out = dst ?? new Float32Array(FIELD_COMPONENT_FLOATS * mixture.length);
  for (let i = 0; i < mixture.length; i++) {
    const c = mixture[i]!;
    const base = FIELD_COMPONENT_FLOATS * i;
    out[base] = c.invCovDiagonal[0];
    out[base + 1] = c.invCovDiagonal[1];
    out[base + 2] = c.invCovDiagonal[2];
    out[base + 3] = c.amplitude;
    out[base + 4] = c.invCovOffDiagonal[0];
    out[base + 5] = c.invCovOffDiagonal[1];
    out[base + 6] = c.invCovOffDiagonal[2];
    out[base + 7] = c.boundRadius;
    out[base + 8] = c.color[0];
    out[base + 9] = c.color[1];
    out[base + 10] = c.color[2];
    // textureWeight (io.wesl's comps doc) — 0 (untouched) for every producer
    // except hiiRegions.ts's pushes.
    out[base + 11] = c.textureWeight ?? 0;
    out[base + 12] = c.center[0];
    out[base + 13] = c.center[1];
    out[base + 14] = c.center[2];
    // starsWeight (io.wesl's comps doc) — 0 (untouched) for every producer
    // except youngStarChain.ts's pushes.
    out[base + 15] = c.starsWeight ?? 0;
  }
  return out;
}
