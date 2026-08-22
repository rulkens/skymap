/**
 * produceVrLabels — THROWAWAY (Quest 3 WebXR spike, 2026-08-22). Emits
 * world-anchored Label3D captions for famous galaxies + featured structures,
 * replacing the Label2D captions the `?vr` boot disables (see
 * `initialState.ts`'s `?vr` branch): those swim with the head because their
 * projection is memoized per `ReadyFrameContext` (`cosmoLabelProjection` /
 * `near0LabelProjection`), which in VR serves one eye's projection to both.
 * Delete with the spike.
 *
 * Placement (`vrLabelArcPlacement`): a giant-radius `Label3DArcPlacement`,
 * yaw-billboarded to face the head. The arc is Label3D's only placement
 * primitive, so a radius many times the em height flattens the curvature
 * away while the anchor glyph still lands EXACTLY on the object's world
 * position — the identity `anchor = center + radius·referenceDir` is exact
 * at `startAngleRad = 0` regardless of how large `radius` is; only
 * letter-to-letter curvature across the string is approximated.
 *
 * Size: constant apparent angular height (~1.8°) rather than a fixed
 * physical em, so near and far labels read at a similar size in the headset.
 *
 * Scope: famous galaxies + featured structures — the two Label2D producers
 * with the richest content. Scene-body captions are skipped for the spike
 * (would need a third data join for modest payoff). No per-producer
 * declutter is ported: candidates are simply capped to the nearest
 * `VR_LABEL_MAX_COUNT` by distance from the head.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Label3DProducerOutput } from '../../../@types/engine/subsystems/Label3DProducerOutput';
import type { Label3D } from '../../../@types/rendering/Label3D';
import type { Label3DArcPlacement } from '../../../@types/rendering/Label3DArcPlacement';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';
import { vrOverride } from '../../xr/vrSpikeState';
import { Source } from '../../../data/sources';
import { FONT_IDS } from '../../../data/fonts';
import { famousDisplayName } from '../helpers/famousDisplayName';
import { FAMOUS_LABEL_STYLE } from './famousLabelStyle';
import { STRUCTURE_MARKER_STYLES } from './structureMarkerStyles';
import { wrapLabelName } from '../../../utils/format/wrapLabelName';

/** Text's local "up" axis — a yaw-only billboard, never pitched toward the head. */
const WORLD_UP: Vec3 = [0, 1, 0];

/** Constant apparent height each label subtends at the head (~1.8°). */
const VR_LABEL_ANGULAR_HEIGHT_RAD = 0.0314;

/** radius/emMpc ratio large enough that per-glyph curvature reads as flat. */
const VR_LABEL_RADIUS_TO_EM_RATIO = 2000;

/** Nearest-N cap — stands in for the 2D declutter director this spike skips. */
const VR_LABEL_MAX_COUNT = 24;

/** Floor under the head↔anchor distance so a coincident head can't zero the em size. */
const MIN_DISTANCE_MPC = 1e-6;

/**
 * The giant-radius arc that places one glyph run at `anchorWorldPos`, facing
 * `headWorldPos` (yaw-only, world-up letters). Exported for direct geometry
 * testing.
 *
 * `startAngleRad` is always 0: `center` is solved backwards from `anchor =
 * center + radiusMpc·referenceDir`, so that identity is EXACT — no
 * approximation — independent of `radiusMpc`'s magnitude.
 */
export function vrLabelArcPlacement(
  anchorWorldPos: Vec3,
  headWorldPos: Vec3,
  emMpc: number,
): Label3DArcPlacement {
  const dx = anchorWorldPos[0] - headWorldPos[0];
  const dz = anchorWorldPos[2] - headWorldPos[2];
  const horizLen = Math.hypot(dx, dz);
  // Anchor directly above/below the head: horizontal direction is undefined —
  // fall back to an arbitrary in-plane axis rather than divide by zero.
  const referenceDir: Vec3 = horizLen > 1e-9 ? [dx / horizLen, 0, dz / horizLen] : [1, 0, 0];
  const radiusMpc = emMpc * VR_LABEL_RADIUS_TO_EM_RATIO;
  return {
    center: [
      anchorWorldPos[0] - radiusMpc * referenceDir[0],
      anchorWorldPos[1],
      anchorWorldPos[2] - radiusMpc * referenceDir[2],
    ],
    planeNormal: WORLD_UP,
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

export function produceVrLabels(
  state: EngineState,
  _ctx: ReadyFrameContext,
): Label3DProducerOutput {
  const empty: Label3DProducerOutput = { labels: [], awake: false };
  if (!vrOverride.active || vrOverride.eyes.length === 0) return empty;

  // One frame stale is fine (see task note) — this reads whatever eye poses
  // the XR loop last wrote, not necessarily THIS frame's.
  let hx = 0;
  let hy = 0;
  let hz = 0;
  for (const eye of vrOverride.eyes) {
    hx += eye.camPos[0];
    hy += eye.camPos[1];
    hz += eye.camPos[2];
  }
  const eyeCount = vrOverride.eyes.length;
  const headWorldPos: Vec3 = [hx / eyeCount, hy / eyeCount, hz / eyeCount];

  const candidates = [...collectFamousCandidates(state), ...collectStructureCandidates(state)];
  if (candidates.length === 0) return empty;

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

  const labels: Label3D[] = [];
  const emitCount = Math.min(VR_LABEL_MAX_COUNT, withDistance.length);
  for (let i = 0; i < emitCount; i++) {
    const { c, distanceMpc } = withDistance[i]!;
    // Constant apparent size: em height scales linearly with distance so
    // near and far labels read at the same angular height in the headset.
    const emMpc = Math.max(distanceMpc, MIN_DISTANCE_MPC) * Math.tan(VR_LABEL_ANGULAR_HEIGHT_RAD);
    labels.push({
      id: c.id,
      text: c.text,
      font: FONT_IDS[0]!,
      placement: vrLabelArcPlacement(c.worldPos, headWorldPos, emMpc),
      emMpc,
      repeatCount: 1,
      color: c.color,
      fadeAlpha: 1,
    });
  }

  return { labels, awake: false };
}
