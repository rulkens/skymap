/**
 * produceVrLabels — THROWAWAY (Quest 3 WebXR spike, 2026-08-22). Emits
 * world-anchored Label3D captions for famous galaxies + featured structures
 * (COSMO channel) and scene-body names (NEAR0 channel — Earth, the local star
 * map, the planets), replacing the Label2D captions the `?vr` boot disables
 * (see `initialState.ts`'s `?vr` branch): those swim with the head because
 * their projection is memoized per `ReadyFrameContext` (`cosmoLabelProjection`
 * / `near0LabelProjection`), which in VR serves one eye's projection to both.
 * Delete with the spike.
 *
 * ### Orientation recipe (`vrLabelArcPlacement`)
 *
 * `U` (ascender / plane-normal) is `vrOverride.physicalUpWorld` — the world
 * direction that currently reads as physically vertical, NOT world-Y (world-Y
 * tilts with accumulated orbit once the user has spun the view — the bug
 * report this fixes). `R0` (referenceDir, angle-zero direction) is resolved
 * per label by `resolveReferenceDir`: the horizontal (U-perpendicular)
 * component of "anchor minus head", i.e. pointing AWAY from the viewer. That
 * sign is what makes the glyph run read left-to-right rather than mirrored —
 * see this module's test file for the concrete numeric derivation through
 * `shaders/labels3d/vertex.wesl`'s math. `vrLabelArcPlacement`'s anchor
 * identity (`anchor = center + radius·referenceDir` at `startAngleRad = 0`) is
 * exact regardless of `radius`'s magnitude, so a giant radius flattens
 * per-glyph curvature away while still landing on the object's true position.
 *
 * Each label's text-anchor `P` sits `ABOVE_OBJECT_EM_RATIO * emMpc` above the
 * object along `U`, per the "labels should always be above the object" report
 * — small relative to the label's own em size, so the ~1.8°-constant-angular
 * `emMpc` sizing below still governs legibility.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Label3DProducerOutput } from '../../../@types/engine/subsystems/Label3DProducerOutput';
import type { Label3D } from '../../../@types/rendering/Label3D';
import type { Label3DArcPlacement } from '../../../@types/rendering/Label3DArcPlacement';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';
import { vrOverride } from '../../xr/vrSpikeState';
import { vrHeadWorldPos } from '../../../utils/camera/vrHeadWorldPos';
import { rejectVec3 } from '../../../utils/math/rejectVec3';
import { Source } from '../../../data/sources';
import { FONT_IDS } from '../../../data/fonts';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { famousDisplayName } from '../helpers/famousDisplayName';
import { FAMOUS_LABEL_STYLE } from './famousLabelStyle';
import { STRUCTURE_MARKER_STYLES } from './structureMarkerStyles';
import { wrapLabelName } from '../../../utils/format/wrapLabelName';
import { sceneBodyStates } from '../frame/sceneBodyStates';
import { sceneBodyLabels } from './sceneBodyLabels';

/** Constant apparent height each label subtends at the head (~1.8°). */
const VR_LABEL_ANGULAR_HEIGHT_RAD = 0.0314;

/** radius/emMpc ratio large enough that per-glyph curvature reads as flat. */
const VR_LABEL_RADIUS_TO_EM_RATIO = 2000;

/** "Above the object" offset, in units of the label's own em height. */
const ABOVE_OBJECT_EM_RATIO = 1.5;

/** Nearest-N cap for the COSMO channel (famous galaxies + structures). */
const VR_LABEL_MAX_COUNT = 24;

/** Nearest-N cap for the NEAR0 channel (scene bodies) — a much smaller roster. */
const VR_BODY_LABEL_MAX_COUNT = 16;

/** Floor under the head↔anchor distance so a coincident head can't zero the em size. */
const MIN_DISTANCE_MPC = 1e-6;

/**
 * Below this (dimensionless — `raw` is normalized first) rejected length, the
 * anchor sits too close to directly overhead/underfoot along `U` for a stable
 * horizontal reference direction this frame.
 */
const REFERENCE_DIR_DEGENERATE_EPS = 1e-6;

/**
 * The last non-degenerate `referenceDir` resolved per label id — reused on a
 * degenerate frame (anchor directly overhead) instead of an arbitrary world
 * axis that would ignore the viewer. Module-scoped: labels are stable ids
 * across frames (a famous galaxy, a structure, a scene body), so this is a
 * per-id memory, not a per-frame cache.
 */
const lastReferenceDirById = new Map<string, Vec3>();

/** Any world axis reliably non-parallel to `u`, for the one-time bootstrap case (no prior frame's direction exists yet for this id). */
function arbitraryPerpendicular(u: Readonly<Vec3>): Vec3 {
  const candidate: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const r = rejectVec3(candidate, u);
  const len = Math.hypot(r[0], r[1], r[2]) || 1;
  return [r[0] / len, r[1] / len, r[2] / len];
}

/**
 * Resolve this label's `referenceDir` (R0): the horizontal (U-perpendicular)
 * direction from head to anchor, negated — see this module's header for why
 * that sign reads unmirrored. Degenerate (anchor ~overhead along `U`) falls
 * back to the last frame's direction for this id, per the task's "not a
 * constant world axis" requirement.
 */
function resolveReferenceDir(
  id: string,
  anchorWorldPos: Readonly<Vec3>,
  headWorldPos: Readonly<Vec3>,
  upU: Readonly<Vec3>,
): Vec3 {
  const raw: Vec3 = [
    anchorWorldPos[0] - headWorldPos[0],
    anchorWorldPos[1] - headWorldPos[1],
    anchorWorldPos[2] - headWorldPos[2],
  ];
  const rawLen = Math.hypot(raw[0], raw[1], raw[2]) || 1;
  const rejected = rejectVec3([raw[0] / rawLen, raw[1] / rawLen, raw[2] / rawLen], upU);
  const rejLen = Math.hypot(rejected[0], rejected[1], rejected[2]);

  const dir: Vec3 =
    rejLen > REFERENCE_DIR_DEGENERATE_EPS
      ? [rejected[0] / rejLen, rejected[1] / rejLen, rejected[2] / rejLen]
      : (lastReferenceDirById.get(id) ?? arbitraryPerpendicular(upU));
  lastReferenceDirById.set(id, dir);
  return dir;
}

/**
 * The giant-radius arc that places one glyph run centered at
 * `centerTextWorldPos`, in the plane normal to `planeNormal` (the ascender /
 * "up" axis), angle-zero along `referenceDir`. Exported for direct geometry
 * testing. Callers resolve `planeNormal`/`referenceDir`/sizing (see this
 * module's header); this function is the pure anchor-identity arithmetic.
 */
export function vrLabelArcPlacement(
  centerTextWorldPos: Vec3,
  planeNormal: Vec3,
  referenceDir: Vec3,
  radiusMpc: number,
): Label3DArcPlacement {
  return {
    center: [
      centerTextWorldPos[0] - radiusMpc * referenceDir[0],
      centerTextWorldPos[1] - radiusMpc * referenceDir[1],
      centerTextWorldPos[2] - radiusMpc * referenceDir[2],
    ],
    planeNormal,
    referenceDir,
    radiusMpc,
    startAngleRad: 0,
  };
}

type VrLabelCandidate = {
  readonly id: string;
  readonly text: string;
  readonly worldPos: Vec3;
  readonly color: Vec4;
};

/** Famous-galaxy candidates — same catalog ⋈ meta join as `produceFamousGalaxyLabels`. */
function collectFamousCandidates(state: EngineState): VrLabelCandidate[] {
  if (!state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled) return [];
  const catalog = state.data.galaxies.get(Source.FamousGalaxy);
  const meta = state.famousGalaxiesMeta;
  if (catalog === undefined || catalog.count === 0 || meta.length === 0) return [];

  const out: VrLabelCandidate[] = [];
  const count = Math.min(meta.length, catalog.count);
  for (let i = 0; i < count; i++) {
    const e = meta[i]!;
    out.push({
      id: `vr-famous-${e.id}`,
      text: famousDisplayName(e),
      worldPos: [
        catalog.positions[i * 3]!,
        catalog.positions[i * 3 + 1]!,
        catalog.positions[i * 3 + 2]!,
      ],
      color: FAMOUS_LABEL_STYLE.labelColor,
    });
  }
  return out;
}

/** Featured-structure candidates — same gate as `produceStructureLabels`' anchor + toggle checks. */
function collectStructureCandidates(state: EngineState): VrLabelCandidate[] {
  const out: VrLabelCandidate[] = [];
  for (const p of state.data.structures.all()) {
    if (!p.featured) continue;
    if (!state.settings.structures.items[p.category].labelEnabled) continue;
    out.push({
      id: `vr-structure-${p.id}`,
      text: wrapLabelName(p.name),
      worldPos: p.worldPos,
      color: STRUCTURE_MARKER_STYLES[p.category].labelColor,
    });
  }
  return out;
}

/**
 * Scene-body candidates (Earth, the local star map, the planets, Sgr A*) —
 * reuses `produceSceneBodyCaptions`'s own data source (`sceneBodyStates` +
 * `sceneBodyLabels`) rather than re-deriving body positions. These route to
 * the NEAR0 channel (see `Label3DProducerOutput.labelsNear0`): planet-scale
 * absolute world-Mpc positions denormal-flush in the COSMO renderer's f32
 * upload.
 */
function collectSceneBodyCandidates(
  state: EngineState,
  ctx: ReadyFrameContext,
): VrLabelCandidate[] {
  const bodyStates = sceneBodyStates(state, ctx);
  const out: VrLabelCandidate[] = [];
  for (const caption of sceneBodyLabels(bodyStates)) {
    out.push({
      id: `vr-${caption.id}`,
      text: caption.text,
      // sceneBodyLabels' worldPos is RENDER_ORIGIN_MPC-relative; VR candidates
      // want absolute world Mpc, matching the COSMO candidates above.
      worldPos: [
        caption.worldPos[0] + RENDER_ORIGIN_MPC[0],
        caption.worldPos[1] + RENDER_ORIGIN_MPC[1],
        caption.worldPos[2] + RENDER_ORIGIN_MPC[2],
      ],
      color: caption.color,
    });
  }
  return out;
}

/** Build one Label3D from a candidate at a known head distance. */
function placeCandidate(
  candidate: VrLabelCandidate,
  distanceMpc: number,
  headWorldPos: Vec3,
  upU: Vec3,
): Label3D {
  // Constant apparent size: em height scales linearly with distance so near
  // and far labels read at the same angular height in the headset.
  const emMpc = Math.max(distanceMpc, MIN_DISTANCE_MPC) * Math.tan(VR_LABEL_ANGULAR_HEIGHT_RAD);
  const aboveOffset = ABOVE_OBJECT_EM_RATIO * emMpc;
  const centerTextWorldPos: Vec3 = [
    candidate.worldPos[0] + upU[0] * aboveOffset,
    candidate.worldPos[1] + upU[1] * aboveOffset,
    candidate.worldPos[2] + upU[2] * aboveOffset,
  ];
  const referenceDir = resolveReferenceDir(candidate.id, candidate.worldPos, headWorldPos, upU);
  const radiusMpc = emMpc * VR_LABEL_RADIUS_TO_EM_RATIO;

  return {
    id: candidate.id,
    text: candidate.text,
    font: FONT_IDS[0]!,
    placement: vrLabelArcPlacement(centerTextWorldPos, upU, referenceDir, radiusMpc),
    emMpc,
    repeatCount: 1,
    color: candidate.color,
    fadeAlpha: 1,
  };
}

/** Sort by head distance, cap to `maxCount`, and place each survivor. */
function capAndPlace(
  candidates: readonly VrLabelCandidate[],
  headWorldPos: Vec3,
  upU: Vec3,
  maxCount: number,
): Label3D[] {
  const withDistance = candidates
    .map((c) => ({
      c,
      distanceMpc: Math.hypot(
        c.worldPos[0] - headWorldPos[0],
        c.worldPos[1] - headWorldPos[1],
        c.worldPos[2] - headWorldPos[2],
      ),
    }))
    .sort((a, b) => a.distanceMpc - b.distanceMpc);

  const emitCount = Math.min(maxCount, withDistance.length);
  const labels: Label3D[] = [];
  for (let i = 0; i < emitCount; i++) {
    const { c, distanceMpc } = withDistance[i]!;
    labels.push(placeCandidate(c, distanceMpc, headWorldPos, upU));
  }
  return labels;
}

export function produceVrLabels(state: EngineState, ctx: ReadyFrameContext): Label3DProducerOutput {
  const empty: Label3DProducerOutput = { labels: [], labelsNear0: [], awake: false };
  if (!vrOverride.active || vrOverride.eyes.length === 0) return empty;

  // One frame stale is fine (see task note) — this reads whatever eye poses
  // the XR loop last wrote, not necessarily THIS frame's.
  const headWorldPos = vrHeadWorldPos(vrOverride.eyes);
  const upU = vrOverride.physicalUpWorld;

  const cosmoCandidates = [...collectFamousCandidates(state), ...collectStructureCandidates(state)];
  const bodyCandidates = collectSceneBodyCandidates(state, ctx);
  if (cosmoCandidates.length === 0 && bodyCandidates.length === 0) return empty;

  const labels = capAndPlace(cosmoCandidates, headWorldPos, upU, VR_LABEL_MAX_COUNT);
  const labelsNear0 = capAndPlace(bodyCandidates, headWorldPos, upU, VR_BODY_LABEL_MAX_COUNT);

  return { labels, labelsNear0, awake: false };
}
