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

import type { GalaxyDustFeature } from '../../../../src/@types/galaxy/GalaxyDustFeature';
import type { GalaxyFieldComponent } from '../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/** Float count of `io.wesl`'s `FieldUniforms` header — 8 vec4, camera + params + counts + counts2 + dustExtinction. */
export const FIELD_HEADER_FLOATS = 32;

/** Byte size of the header struct, for `createBuffer`. */
export const FIELD_HEADER_BUFFER_SIZE = FIELD_HEADER_FLOATS * 4;

/** Floats per `comps` entry — four vec4, as `io.wesl`'s layout comment documents. */
export const FIELD_COMPONENT_FLOATS = 16;

/** Floats per `feats` entry — five vec4, as `io.wesl`'s FEATS layout comment documents. */
export const FIELD_FEATURE_FLOATS = 20;

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
 * packFieldHeaderUniforms — camera basis + params + the four live counts +
 * the dust extinction law, into the 128-byte uniform. Called every
 * `drawFrame`; all four counts are whatever `repackFieldComponents`
 * (createGalaxyEngine.ts) last sized the storage buffer to (the two packers
 * are called from different sites, so the counts travel as plain arguments
 * rather than being re-derived here).
 *
 * `dustExtinctionRgb` rides the header, not the per-component colour lane,
 * because the primary galaxy's attenuation no longer reads per-component
 * colour at all — dustMap.wesl collapses every dust component to a scalar
 * (tau, tau*tPeak) column before splat.wesl ever sees it (see io.wesl's
 * dust-component comment), so the law has to arrive some other way, once
 * per frame, for the whole primary galaxy.
 *
 * `emissionCount` (the former `componentCount`) is the draw call's own
 * instance count — dust components are never drawn as quads. `dustOffset`
 * locates the dust slice within `comps` (always `emissionCount`, since dust
 * is appended last — see io.wesl); `dustCount` its length. `primaryCount` is
 * the CENTRAL galaxy's own share of `emissionCount` (its components are
 * packed first), which the shader gates dust application on: an extra's
 * emission must never read the primary's dust. `featCount` is the detail-
 * tier dust feature draw's own instance count, into the SEPARATE `feats`
 * storage array (io.wesl's counts2.x) — unrelated to `comps` sizing.
 * `dustMapHeightPx` is `dustMapTex`'s own pixel height (see
 * `buildDustMapTarget`, which sizes it to `reducedSize(render.fieldDivisor)`,
 * the SAME extent as `fieldTex`) — plumbed through but currently unread by
 * dustFeature.wesl (its width clamp uses `fwidth()` instead, see io.wesl's
 * counts2.y doc); reserved for the detail tier's future octave band-limiting.
 */
export function packFieldHeaderUniforms(
  cam: FieldCamera,
  emissionCount: number,
  dustOffset: number,
  dustCount: number,
  primaryCount: number,
  featCount: number,
  dustMapHeightPx: number,
  dustExtinctionRgb: Vec3,
  dst?: Float32Array,
): Float32Array {
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
  out[20] = emissionCount;
  out[21] = dustOffset;
  out[22] = dustCount;
  out[23] = primaryCount;

  // counts2 24..27 = (featCount, dustMapHeightPx, reserved, reserved).
  out[24] = featCount;
  out[25] = dustMapHeightPx;
  out[26] = 0;
  out[27] = 0;

  // dustExtinction 28..31 = (A_lambda/A_V per channel, unused).
  out[28] = dustExtinctionRgb[0];
  out[29] = dustExtinctionRgb[1];
  out[30] = dustExtinctionRgb[2];
  out[31] = 0;

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

/**
 * packFieldFeatures — the detail-tier dust splat network's own flat list
 * (`dustLaneFeatures.ts` today; spurs/bubbles/beads land in the same array
 * later, per `kind`), into the `feats` storage buffer's bytes — see
 * io.wesl's FEATS layout comment for the five-vec4 shape. Primary galaxy
 * only (design doc Q6); there is no per-extra concatenation the way
 * `packFieldComponents` does.
 */
export function packFieldFeatures(
  features: readonly GalaxyDustFeature[],
  dst?: Float32Array,
): Float32Array {
  const out = dst ?? new Float32Array(FIELD_FEATURE_FLOATS * features.length);
  for (let i = 0; i < features.length; i++) {
    const f = features[i]!;
    const base = FIELD_FEATURE_FLOATS * i;
    out[base] = f.p0[0];
    out[base + 1] = f.p0[1];
    out[base + 2] = f.p0[2];
    out[base + 3] = f.width;
    out[base + 4] = f.p1[0];
    out[base + 5] = f.p1[1];
    out[base + 6] = f.p1[2];
    out[base + 7] = f.amplitude;
    out[base + 8] = f.normal[0];
    out[base + 9] = f.normal[1];
    out[base + 10] = f.normal[2];
    out[base + 11] = f.edgeSharpness;
    out[base + 12] = f.noiseSeed;
    out[base + 13] = f.noiseAmp;
    out[base + 14] = f.noiseFreq;
    out[base + 15] = f.kind;
    // Joints must butt seamlessly — per-segment tapering is what produced
    // the dashed-lane defect; taperIn/taperOut are now 0 at every interior
    // joint and only nonzero at a chain's two free ends.
    out[base + 16] = f.sOffset;
    out[base + 17] = f.taperIn;
    out[base + 18] = f.taperOut;
    out[base + 19] = 0;
  }
  return out;
}
