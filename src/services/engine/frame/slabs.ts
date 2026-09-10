/**
 * slabs — per-frame derivation of the `Slab` table, and the executor-side lookup
 * that resolves a `slab: number` index into a `SlabView`.
 *
 * The scene's near/far ratio exceeds what one depth buffer can hold; each slab is
 * one bracket of it. See the `Slab` type doc for the precision argument.
 */

import type { Mat4 } from 'wgpu-matrix';
import { mat4d } from 'wgpu-matrix';

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../@types/engine/frame/Slab';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { ChainRow } from '../../../@types/scene/ChainRow';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { computeForegroundViewProj } from '../../../utils/camera/computeForegroundViewProj';
import { foregroundFrustum, MIN_NEAR_M, NEAR_RATIO } from '../../../utils/camera/foregroundFrustum';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { projectToScreenPx } from '../../../utils/camera/projectToScreenPx';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { bodyDrawRadiusM } from '../../../utils/scene/bodyDrawRadiusM';
import { chainOverlapViolations } from '../../../utils/scene/chainOverlapViolations';
import { PROXY_SCALE } from '../../../utils/scene/proxyScale';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';

/** Near-field slab: origin-relative near-Earth bodies (Sun, Earth), drawn in f64. */
export const NEAR0 = 0;
/** Cosmological slab: galaxies, Milky Way, filaments — everything at Mpc scale. */
export const COSMO = 1;

// The one place that knows the index layout, for callers holding only a numeric
// `slab` and no `ctx` — anyone holding a `Slab` should read `frame.kind` instead.
export function isBodySlabIndex(index: number): boolean {
  return index >= 2;
}

// `'BODY[k]'` for a body row at array position `k + 2` — the painter ordinal its
// index already carries. Total, so `groupKeyOf` needs no fallback.
export function slabName(index: number): string {
  if (index === NEAR0) return 'NEAR0';
  if (index === COSMO) return 'COSMO';
  return `BODY[${index - 2}]`;
}

// The ONE definition of a merged group-timing slot key: allocation and lookup must
// produce byte-identical keys, so the middle-dot separator (U+00B7) is part of the
// wire format — do not vary it.
export function groupKeyOf(target: string, slab: number): string {
  return `${target}·${slabName(slab)}`;
}

// Body rows and capture faces are appended because both draw the same pass more
// than once per frame against one `(target, slab)` — without them the passes attach
// the same query pair and the last silently overwrites the rest.
export function passTimingSlotName(passName: string, slabIndex: number, face?: number): string {
  const base = isBodySlabIndex(slabIndex) ? `${passName}·${slabName(slabIndex)}` : passName;
  return face === undefined ? base : `${base}·FACE[${face}]`;
}

// The same disambiguation one level up, for the STEP's own slot: six capture steps
// share one `(target, slab)` — the array layer they write is not part of that key —
// so `groupKeyOf` alone collides across faces.
export function renderStepTimingSlotName(
  groupKey: string,
  face: number | undefined,
  lensPhase?: 'pre' | 'post',
): string {
  if (face !== undefined) return `${groupKey}·FACE[${face}]`;
  // Only 'post' needs disambiguating: the split is all-or-nothing per frame, so no
  // frame emits an untagged (hdr, NEAR0) step alongside a 'pre' one.
  return lensPhase === 'post' ? `${groupKey}·POST_LENSING` : groupKey;
}

// Single-sourced because the timing-slot list and `executeFrame`'s group filter
// must never disagree on which layers a `'pre'`/`'post'` step selects.
export function matchesLensPhase(
  hdrPostLensing: true | undefined,
  stepLensPhase: 'pre' | 'post' | undefined,
): boolean {
  if (stepLensPhase === undefined) return true;
  return stepLensPhase === 'post' ? hdrPostLensing === true : hdrPostLensing !== true;
}

/**
 * The single source of each slab's depth convention: `false` ⇒ smaller-z-wins /
 * clear-`1.0` / `mat4d.perspective`; `true` ⇒ reversed-Z. NEAR0 is `true` because
 * its ~1e8 near/far ratio crowds nearly all non-reversed depth resolution against
 * the near plane, and the Sun at 1 AU then quantizes onto the far plane and
 * flickers. Every pipeline `depthCompare`, both depth clears, and the foreground
 * projection builder read this constant, so a half-reversed state is impossible.
 */
export const SLAB_REVERSED_Z: Readonly<Record<number, boolean>> = {
  [NEAR0]: true,
  [COSMO]: false,
};

// The near-field lookAt takes its image-plane up from `imagePlaneBasis` with
// `cam.roll` applied — the SAME roll COSMO's `computeViewProj` and the body rows'
// `camBasisWorld` honour. `toWorldArm` sets a non-zero roll whenever the body arm
// is live, so dropping it rotates every NEAR0 layer against every other slab.
const forwardScratch: Vec3 = [0, 0, 0];
const upRefScratch: Vec3 = [0, 0, 0];
const basisScratch: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

// Fixed, in Mpc: 10 kpc sits below the nearest cosmological content, 50 Gpc holds
// every catalogued galaxy. Anything drawing INSIDE 10 kpc cannot live on this slab
// — the Milky Way impostor's disc got clipped mid-descent and moved to NEAR0.
const COSMO_NEAR_MPC = 0.01;
const COSMO_FAR_MPC = 50000;

// Relative pad on top of a body row's near-plane margin (`bodySlabRow`), so
// the widest drawn shell's own near face sits strictly behind the plane
// rather than exactly on it — f32-narrowing or reversed-Z rounding could
// otherwise land a boundary vertex on the wrong side.
const NEAR_MARGIN_EPS = 1e-3;

/**
 * Build one body's slab row, or `null` when the body has no pose this frame.
 *
 * `vp` is built ABOUT THE EYE, so `lookAt`'s rotation carries no translation and
 * geometry drawn here must already be eye-relative (RTC-native, no rebase). `far`
 * is `+∞`; the row's FINITE far bound is `distanceRangeM[1]`, used by the painter
 * sort, not by this projection. A body with no screen position (`clipW <= 0`) gets
 * `[Infinity, Infinity]` for `centrePx`, so it never registers a false overlap.
 */
function bodySlabRow(input: {
  readonly body: SceneBody;
  readonly pose: BodyPoseProvider;
  readonly fovYRad: number;
  readonly aspect: number;
  readonly viewportPx: Readonly<Vec2>;
}): {
  // Narrowed back to non-null: nullability on `Slab` exists for NEAR0 alone.
  readonly slab: Omit<Slab, 'index' | 'distanceRangeM'> & {
    readonly distanceRangeM: readonly [number, number];
  };
  readonly chainRow: Omit<ChainRow, 'index'>;
} | null {
  const { body, pose, fovYRad, aspect, viewportPx } = input;
  const relPose = pose(body.id as BodyId);
  if (relPose === null) return null;
  const { eyeRelBodyM, basisM } = relPose;

  const dM = Math.hypot(eyeRelBodyM[0], eyeRelBodyM[1], eyeRelBodyM[2]);
  const rMaxM = bodyDrawRadiusM(body);
  const forward: Vec3 = [basisM[6], basisM[7], basisM[8]];
  const up: Vec3 = [basisM[3], basisM[4], basisM[5]];

  // Clip depth is measured along the VIEW AXIS, not the radial distance dM: a body
  // θ off-axis has view-z = dM·cosθ, well short of dM. Exact, not an approximation
  // of the sphere's near face: the dot product is linear, so a sphere's minimum
  // view-z is exactly centre·forward − radius at any transverse offset.
  const viewZ = -(
    eyeRelBodyM[0] * forward[0] +
    eyeRelBodyM[1] * forward[1] +
    eyeRelBodyM[2] * forward[2]
  );
  // Whichever drawn shell reaches furthest along the view axis: the
  // PROXY_SCALE-inflated mesh, or a wider un-inflated outer shell (rings, atmosphere).
  const marginM = Math.max(PROXY_SCALE * body.radiusM, rMaxM) * (1 + NEAR_MARGIN_EPS);
  // The altitude-above-SURFACE term stays radial: it only wins once the camera is
  // inside the outermost shell, a close orbit/descent around THIS body where θ ≈ 0.
  // Dropping it and falling straight to MIN_NEAR_M collapses the near-field label
  // window at low altitude.
  const near = Math.max(viewZ - marginM, (dM - body.radiusM) * NEAR_RATIO, MIN_NEAR_M);
  // STAYS RADIAL — the painter sort and pick ordering key off actual distance.
  const distanceRangeM: readonly [number, number] = [Math.max(dM - rMaxM, 0), dM + rMaxM];

  // Body rows share NEAR0's convention; reading the constant rather than
  // hard-coding the reversed branch is what keeps a flip from half-landing.
  const reversedZ = SLAB_REVERSED_Z[NEAR0]!;
  const view = mat4d.lookAt([0, 0, 0], forward, up);
  const proj = reversedZ
    ? mat4d.perspectiveReverseZ(fovYRad, aspect, near)
    : mat4d.perspective(fovYRad, aspect, near, dM + rMaxM);
  const vp = mat4d.multiply(proj, view) as Float64Array;

  // DEV-only, like the §7.2 scan that reads it — a prod frame skips both.
  const centrePx = import.meta.env.DEV
    ? (projectToScreenPx([-eyeRelBodyM[0], -eyeRelBodyM[1], -eyeRelBodyM[2]], vp, viewportPx) ??
      ([Infinity, Infinity] as const))
    : ([0, 0] as const);
  const radiusPx = import.meta.env.DEV
    ? bodyApparentDiameterPx({
        positionMpc: [dM * SCALE_UNITS.M_TO_MPC, 0, 0],
        radiusM: rMaxM,
        camPosMpc: [0, 0, 0],
        viewportHeightPx: viewportPx[1],
        fovYRad,
      }) / 2
    : 0;

  return {
    slab: {
      near,
      far: Infinity,
      vp,
      frame: { kind: 'body-m', bodyId: body.id as BodyId },
      distanceRangeM,
      precision: 'f64',
      reversedZ,
    },
    chainRow: { distanceRangeM, centrePx, radiusPx },
  };
}

/**
 * Derive this frame's slab table: `[near0, cosmo, ...bodyRows]`, body rows taking
 * indices `2, 3, …` in back-to-front painter order (spec §4/§7).
 *
 * NEAR0's vp subtracts `RENDER_ORIGIN_MPC` in f64 before `lookAt`, so the
 * translation stays small and sub-metre bodies survive the narrow to f32 at the
 * GPU-upload boundary. f32→f64 widening is exact, so narrowing COSMO's vp back
 * round-trips byte-equal — which is why `slabViewOf` needs no COSMO special case.
 */
export function deriveSlabs(input: {
  readonly cam: OrbitCamera;
  readonly cosmoVp: Mat4;
  readonly pivotRadiusMpc: number | null;
  readonly pose: BodyPoseProvider;
  readonly visibleBodies: readonly SceneBody[];
  readonly viewportPx: Readonly<Vec2>;
  readonly starSphereRangeM: readonly [number, number] | null;
}): readonly Slab[] {
  const { cam, cosmoVp, pivotRadiusMpc, pose, visibleBodies, viewportPx } = input;
  // NEAR0's bracket is adaptive, sized from ALTITUDE above a known pivot (else raw
  // orbit distance), so depth precision holds from galaxy scale down to standing on
  // a surface — with raw distance a large body's radius dominated the bracket.
  const altitudeMpc = pivotRadiusMpc !== null ? cam.distance - pivotRadiusMpc : cam.distance;
  const { near, far } = foregroundFrustum(altitudeMpc);
  const fx = cam.target[0] - cam.position[0];
  const fy = cam.target[1] - cam.position[1];
  const fz = cam.target[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  forwardScratch[0] = fx / flen;
  forwardScratch[1] = fy / flen;
  forwardScratch[2] = fz / flen;
  const { rolledUp } = imagePlaneBasis(
    forwardScratch,
    cam.roll ?? 0,
    frameUp(cam.upBasis, upRefScratch),
    basisScratch,
  );
  const nearFieldVp = computeForegroundViewProj({
    eyeMpc: cam.position,
    targetMpc: cam.target,
    up: rolledUp,
    renderOrigin: RENDER_ORIGIN_MPC,
    fovYRad: cam.fovYRad,
    aspect: cam.aspect,
    near,
    far,
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
  });

  const near0: Slab = {
    index: NEAR0,
    near,
    far,
    vp: nearFieldVp,
    // The vp is relative to `RENDER_ORIGIN_MPC`, so any layer on this slab must
    // upload origin-relative model matrices.
    frame: { kind: 'world-mpc', originRelative: true },
    // §7.1: the star spheres actually drawn this frame, not the frustum bracket.
    // `null` travels as itself; `foregroundChainOrder` gives it a sort position.
    distanceRangeM: input.starSphereRangeM,
    precision: 'f64',
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
  };
  const cosmo: Slab = {
    index: COSMO,
    near: COSMO_NEAR_MPC,
    far: COSMO_FAR_MPC,
    vp: Float64Array.from(cosmoVp),
    frame: { kind: 'world-mpc', originRelative: false },
    // COSMO never enters the painter chain, so this fixed bracket is permanent.
    distanceRangeM: [COSMO_NEAR_MPC * SCALE_UNITS.MPC_TO_M, COSMO_FAR_MPC * SCALE_UNITS.MPC_TO_M],
    precision: 'f32',
    reversedZ: SLAB_REVERSED_Z[COSMO]!,
  };

  // Sorted BEFORE indices are assigned, so index === painter ordinal.
  const sortedBodyRows = visibleBodies
    .map((body) =>
      bodySlabRow({ body, pose, fovYRad: cam.fovYRad, aspect: cam.aspect, viewportPx }),
    )
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.slab.distanceRangeM[0] - a.slab.distanceRangeM[0]);
  const bodyRows: Slab[] = sortedBodyRows.map((row, i) => ({ ...row.slab, index: i + 2 }));

  // Spec §7.2: screen-overlapping body rows must have disjoint distance intervals,
  // else one silently paints over the other. A warn, never a throw — see
  // `chainOverlapViolations` for why "never overlap" is too strong a reading.
  if (import.meta.env.DEV) {
    const chainRows: readonly ChainRow[] = sortedBodyRows.map((row, i) => ({
      index: i + 2,
      ...row.chainRow,
    }));
    for (const [a, b] of chainOverlapViolations(chainRows)) {
      console.warn(`deriveSlabs: painter-order violation between body rows ${a} and ${b}`);
    }
  }

  return [near0, cosmo, ...bodyRows];
}

// NEAR0 plus every body row by `distanceRangeM[0]` descending — the same key body
// rows are stored by, so NEAR0 merges in with no `frame.kind` special case. COSMO
// never appears; it is not a `foreground:0` target.
export function foregroundChainOrder(slabs: readonly Slab[]): readonly number[] {
  return slabs
    .filter((slab) => slab.index === NEAR0 || slab.frame.kind === 'body-m')
    .sort((a, b) => nearestM(b) - nearestM(a))
    .map((slab) => slab.index);
}

// Unknown resolves FAR, not nearest: the pick path holds NEAR0 candidates with no
// sphere behind them (the star catalog, the MW impostor) that must not claim the
// frontmost hit.
function nearestM(slab: Slab): number {
  return slab.distanceRangeM?.[0] ?? Infinity;
}

/**
 * Resolve a `slab: number` index into the `SlabView` a layer's `draw` consumes.
 * `ctx.slabs` is indexed by array position === `Slab.index`, so this is a direct
 * lookup rather than a scan.
 */
export function slabViewOf(ctx: ReadyFrameContext, slabIndex: number): SlabView {
  const slab = ctx.slabs[slabIndex];
  if (!slab) {
    throw new Error(`slabViewOf: no slab at index ${slabIndex}`);
  }
  return {
    slab,
    vp: Float32Array.from(slab.vp),
    camPos: [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
}
