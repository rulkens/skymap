/**
 * packFieldUniforms — the packers for the analytic Milky Way field pass,
 * matching `milkyWayField/io.wesl`'s `FieldUniforms` header and `comps`
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
 * N background extras can outgrow it (`createGalaxyEngine.ts` sizes and
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
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/** Float count of `io.wesl`'s `FieldUniforms` header — 13 vec4, camera + params + counts + counts2 + dustExtinction + dustNoise + dustSlices + debugView + sfMapChannels + bubbleView. */
export const FIELD_HEADER_FLOATS = 52;

/** Byte size of the header struct, for `createBuffer`. */
export const FIELD_HEADER_BUFFER_SIZE = FIELD_HEADER_FLOATS * 4;

/** Floats per `comps` entry — four vec4, as `io.wesl`'s layout comment documents. */
export const FIELD_COMPONENT_FLOATS = 16;

export type FieldCamera = {
  /** Camera world position — the ray origin. */
  readonly eye: Vec3;
  /** View matrix, 16 floats column-major; the basis is read off its rotation rows. */
  readonly view: Float32Array;
  /** Vertical field of view in radians, as handed to `mat4.perspective`. */
  readonly fov: number;
  /** Viewport aspect the PROJECTION was built with, not the pass's own target. */
  readonly aspect: number;
  /** The value written into `proj[8]`. */
  readonly lensShiftX: number;
  /** Whole-field intensity multiplier — the tool's one look knob for this pass. */
  readonly exposure: number;
};

/**
 * The dust-noise erosion lane (io.wesl's `dustNoise`). Unlike the
 * camera/exposure lanes these are cached in `createGalaxyEngine.ts`'s
 * `rebuildDustMixture` — they only change when the dust params or geometry
 * do, not every `drawFrame`.
 */
export type FieldDustNoise = {
  /** World units spanned by one full wrap of the baked noise volume (dustParticleCloud.ts's `dustNoiseTileUnits`). */
  readonly tileUnits: number;
  /** Erosion strength — 0 disables the multiplier and the shader branches out entirely (`GalaxyDustCloudParams.texture`). */
  readonly amplitude: number;
  /** Index WITHIN the dust slice (relative to `dustOffset`) where the particle-cloud components start. Always 0 now — the smooth lane tier this used to skip past was deleted, so the particle cloud IS the dust slice. */
  readonly cloudOffset: number;
  /** Signed-power exponent shaping the noise about its midpoint (dustMap.wesl's `dustNoiseMultiplier`) — `1 / GalaxyDustCloudParams.textureContrast`, inverted here so a higher slider value hardens filament edges. */
  readonly contrastExp: number;
};

/**
 * The dust map's depth-slice edges (io.wesl's `dustSlices`) — VIEW-dependent
 * (a function of the eye's distance to the origin), so unlike `FieldDustNoise`
 * this is recomputed every `drawFrame` rather than cached by
 * `rebuildDustMixture`; only `R`, the dust's own reach, is cached there. See
 * io.wesl's `dustSlices` doc for the geometric-spacing derivation and why it
 * degenerates to linear from outside the galaxy and logarithmic from inside.
 */
export type FieldDustSlices = {
  readonly t1: number;
  readonly t2: number;
  readonly t3: number;
};

/**
 * The three debug-view crossfade weights (io.wesl's `debugView`) plus the
 * combined galaxy dimming weight — packed as one object rather than four
 * positional args, same precedent as `FieldDustNoise`/`FieldDustSlices`.
 * `galaxyWeight` is `1 - max(the three intensities)` clamped to 0, computed
 * once in `drawFrame` and shared by every `packFieldHeaderUniforms` call this
 * frame (the field header AND the HII header) so two active views never
 * double-dim the galaxy.
 */
export type DebugViewWeights = {
  readonly dustViewIntensity: number;
  readonly sfMapViewIntensity: number;
  readonly orientationViewIntensity: number;
  readonly galaxyWeight: number;
};

/**
 * Per-channel isolation weights for the SF-map debug view (io.wesl's
 * `sfMapChannels`), orthogonal to `DebugViewWeights.sfMapViewIntensity` (the
 * whole view's crossfade weight) — sfMapPresent.wesl's palette sums all
 * three channels, so with no per-channel control there was no way to tell
 * gas from oldActivity from recentSf. Each field names what the automaton
 * channel MEANS, not just that it's a weight — see `RenderSettings`'s own
 * docblocks for the same three explained from the slider side.
 */
export type SfMapChannelWeights = {
  /** Unspent ISM fuel — 1 nearly everywhere on a quiet disc, driven to 0 by an ignition, refilled over `1/gasRegen` steps. */
  readonly gasWeight: number;
  /** `exp(-age/12)` — a cell that fired within roughly the last dozen steps. */
  readonly recentSfWeight: number;
  /** The accumulated trace of every front that passed, decayed per step by `activityDecay` — the channel dust placement actually reads. */
  readonly activityWeight: number;
};

/**
 * The dust lanes as one bundle, because a pass either has a dust slice or it
 * has none — the HII header is the "none" case for all four at once.
 * `extinctionRgb` rides the header rather than a per-component colour lane
 * because dustMap.wesl collapses every dust component into four depth-sliced
 * tau columns before splat.wesl ever sees one (io.wesl's dust-component
 * comment), so the law has to arrive once per frame for the whole galaxy.
 */
export type FieldDust = {
  /** The CCM89 law's A_lambda/A_V per channel, for `currentDust.rV`. */
  readonly extinctionRgb: Vec3;
  readonly noise: FieldDustNoise;
  readonly slices: FieldDustSlices;
  /**
   * `dustMapTex`'s OWN pixel height — it carries a divisor independent of
   * every other target's (`createGalaxyRenderTargets`). dustMap.wesl
   * band-limits its four baked octaves against the fragment's world-space
   * pixel footprint with it (io.wesl's counts2.y doc).
   */
  readonly mapHeightPx: number;
};

/**
 * "This pass has no dust", as a VALUE rather than a skipped write — see the
 * pack below for why skipping is a stale-bytes bug. `tileUnits` and
 * `contrastExp` are 1, not 0: dustMap.wesl divides by the first and raises
 * `pow` to the second.
 */
const INERT_DUST: FieldDust = {
  extinctionRgb: [0, 0, 0],
  noise: { tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 },
  slices: { t1: 0, t2: 0, t3: 0 },
  mapHeightPx: 0,
};

/** Everything one `FieldUniforms` header needs, all of it per-pass. */
export type FieldHeaderInput = {
  readonly camera: FieldCamera;
  /** The draw call's own instance count — dust components are never drawn as quads. */
  readonly emissionCount: number;
  /** Length of the dust slice `comps` appends after the emission components. */
  readonly dustCount: number;
  /**
   * The CENTRAL galaxy's share of `emissionCount` (its components pack
   * first). splat.wesl gates dust application on it, so an extra's emission
   * can never read the primary's dust; 0 keeps a whole pass out of the
   * attenuation branch.
   */
  readonly primaryCount: number;
  /**
   * The pixel size of THIS pass's own target (fieldTex for the field header,
   * hiiTex for the HII one) — not the canvas, and not dustMapTex, which
   * carries its own divisor. splat.wesl's fs turns a fragment position into a
   * normalized dustMapTex UV with it (io.wesl's DUST MAP doc).
   */
  readonly targetSizePx: Vec2;
  /** Absent means the pass has no dust; the lanes are still written, inert. */
  readonly dust?: FieldDust;
  readonly debugView: DebugViewWeights;
  readonly sfMapChannels: SfMapChannelWeights;
  /** io.wesl's `bubbleView.x` — bubblePresent.wesl is the only reader. */
  readonly bubbleViewIntensity: number;
};

/**
 * packFieldHeaderUniforms — one 208-byte `FieldUniforms` header, every lane
 * written every call. `dst` is a per-frame scratch shared across headers
 * (createGalaxyEngine's `fieldData`/`hiiData`), so a lane left unwritten
 * silently ships the previous pass's bytes to the GPU — which is why an
 * absent `dust` falls back to `INERT_DUST` instead of skipping its writes.
 */
export function packFieldHeaderUniforms(input: FieldHeaderInput, dst?: Float32Array): Float32Array {
  const {
    camera: cam,
    emissionCount,
    dustCount,
    primaryCount,
    targetSizePx,
    debugView,
    sfMapChannels,
    bubbleViewIntensity,
  } = input;
  const dust = input.dust ?? INERT_DUST;
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
  out[22] = dustCount;
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

  // debugView 40..43 = (dustViewIntensity, sfMapViewIntensity, orientationViewIntensity, galaxyWeight).
  out[40] = debugView.dustViewIntensity;
  out[41] = debugView.sfMapViewIntensity;
  out[42] = debugView.orientationViewIntensity;
  out[43] = debugView.galaxyWeight;

  // sfMapChannels 44..47 = (gasWeight, recentSfWeight, activityWeight, unused).
  out[44] = sfMapChannels.gasWeight;
  out[45] = sfMapChannels.recentSfWeight;
  out[46] = sfMapChannels.activityWeight;
  out[47] = 0;

  // bubbleView 48..51 = (intensity, unused, unused, unused).
  out[48] = bubbleViewIntensity;
  out[49] = 0;
  out[50] = 0;
  out[51] = 0;

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
    out[base + 11] = 0;
    out[base + 12] = c.center[0];
    out[base + 13] = c.center[1];
    out[base + 14] = c.center[2];
    out[base + 15] = 0;
  }
  return out;
}
