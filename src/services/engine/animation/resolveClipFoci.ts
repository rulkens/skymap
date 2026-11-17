/**
 * resolveClipFoci — a pure pre-pass that rewrites every id-bearing effect (and
 * `aimAlong`) in a `ClipData` to its concrete form before `compileClip` runs, so
 * the compiler stays structural (the `resolveClipStart` pattern). Bearings are
 * baked from the LIVE pose at resolve time: a `lookAtId`/`strafeId`/`spinToId` is
 * only right before something else moves the target (see each helper's docstring).
 * A miss throws: the readiness gate (`clipFociReady`) has already checked every id,
 * so a miss is a programmer error, not a case to degrade through.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';
import type { SelectionResolver } from '../../../@types/engine/selection/SelectionResolver';
import type { SceneEffect } from '../../../@types/animation/SceneEffect';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { FocusFraming } from '../../../@types/camera/pose/FocusFraming';
import { moveTarget, dollyTo, aimAt, spin } from './effectHelpers';
import { arrivalFor } from '../camera/framing/arrivalFor';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { imagePlaneBasis } from '../../../utils/camera/orbitPose/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/orbitPose/frameUp';
import { lerpAngleShortest } from '../../../utils/math/lerpAngleShortest';
import { refOfResolution } from '../../../utils/selection/refOfResolution';

/**
 * `from` is `cameraRuntime.from`; `simDays` the live sim instant, so a body
 * resolves where it is drawn now. `frameBasis` is the steady orientation basis
 * bearings encode through (absent ⇒ world frame). `start` is left untouched.
 */
export function resolveClipFoci(
  data: ClipData,
  resolve: SelectionResolver,
  fovYRad: number,
  from: CameraPose,
  simDays: number,
  frameBasis?: Mat3,
): ClipData {
  return {
    ...data,
    timeline: data.timeline.map((e) => walkEffect(e, resolve, fovYRad, from, simDays, frameBasis)),
  };
}

// ─── Walk ────────────────────────────────────────────────────────────────────

function walkEffect(
  effect: Effect,
  resolve: SelectionResolver,
  fovYRad: number,
  from: CameraPose,
  simDays: number,
  frameBasis?: Mat3,
): Effect {
  switch (effect.kind) {
    case 'seq':
    case 'all':
      return {
        ...effect,
        children: effect.children.map((c) =>
          walkEffect(c, resolve, fovYRad, from, simDays, frameBasis),
        ),
      };
    case 'fork':
      return {
        ...effect,
        child: walkEffect(effect.child, resolve, fovYRad, from, simDays, frameBasis),
      };

    case 'moveTargetId': {
      const { target } = resolveFraming(effect.id, resolve, fovYRad, simDays);
      return moveTarget(target, effect.over, effect.ease);
    }
    case 'dollyToId': {
      const { distance } = resolveFraming(effect.id, resolve, fovYRad, simDays);
      // `scale` multiplies the DERIVED framing distance — the author's
      // tighter/looser knob that survives framing-math and catalog changes.
      return dollyTo(distance * (effect.scale ?? 1), effect.over, effect.ease);
    }
    case 'lookAtId': {
      const { target } = resolveFraming(effect.id, resolve, fovYRad, simDays);
      const forward: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      return aimAt(orbitAnglesLookingAlong(forward, frameBasis), effect.over, effect.ease);
    }
    // A world sightline with no `from` dependency: safe for a cold-open snap.
    case 'aimAlong': {
      return aimAt(orbitAnglesLookingAlong(effect.forward, frameBasis), effect.over, effect.ease);
    }
    // Sidesteps along the bearing's horizontal right axis (frame pole as up),
    // holding world height; `byDeg` scales by the live distance, so it reads
    // the same at every scale.
    case 'strafeId': {
      const { target } = resolveFraming(effect.id, resolve, fovYRad, simDays);
      const forward: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      if (Math.hypot(forward[2], forward[0]) < 1e-12) {
        throw new Error(
          `resolveClipFoci: strafeId '${effect.id}' has a vertical bearing — ` +
            `no horizontal right axis exists to strafe along.`,
        );
      }
      const { right } = imagePlaneBasis(forward, 0, frameUp(frameBasis));
      const byMpc = Math.tan((effect.byDeg * Math.PI) / 180) * from.distance;
      const displaced: Vec3 = [
        from.target[0] + right[0] * byMpc,
        from.target[1],
        from.target[2] + right[2] * byMpc,
      ];
      return moveTarget(displaced, effect.over, effect.ease);
    }
    // The shortest signed arc from the live yaw to the subject's bearing, plus
    // `turns` whole revolutions (negative: the long way round). Yaw only, so it
    // composes with `dwellDrift`'s pitch bob.
    case 'spinToId': {
      const { target } = resolveFraming(effect.id, resolve, fovYRad, simDays);
      const forward: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      const { yaw: bearingYaw } = orbitAnglesLookingAlong(forward, frameBasis);
      const shortest = lerpAngleShortest(from.yaw, bearingYaw, 1) - from.yaw;
      const by = shortest + (effect.turns ?? 0) * Math.PI * 2;
      return spin('yaw', { by, over: effect.over, ease: effect.ease });
    }
    // Path pacing must carry through: dropping it strips the helper's defaults
    // on playback, which only the inspector masked (applyPathTuning).
    case 'flyPath': {
      const waypoints = effect.waypoints.map((w) => {
        if (!('id' in w)) return w; // already concrete
        const { target, distance, radius } = resolveFraming(w.id, resolve, fovYRad, simDays);
        return {
          at: target,
          distance,
          radius, // the subject extent a pass-by offset scales by
          ...(w.yaw !== undefined ? { yaw: w.yaw } : {}),
          ...(w.pitch !== undefined ? { pitch: w.pitch } : {}),
          ...(w.over !== undefined ? { over: w.over } : {}),
          ...(w.linger !== undefined ? { linger: w.linger } : {}),
        };
      });
      return {
        kind: 'flyPath',
        waypoints,
        over: effect.over,
        ease: effect.ease,
        ...(effect.align !== undefined ? { align: effect.align } : {}),
        ...(effect.rampSec !== undefined ? { rampSec: effect.rampSec } : {}),
        ...(effect.linger !== undefined ? { linger: effect.linger } : {}),
        ...(effect.lingerSec !== undefined ? { lingerSec: effect.lingerSec } : {}),
        ...(effect.spline !== undefined ? { spline: effect.spline } : {}),
        ...(effect.passBy !== undefined ? { passBy: effect.passBy } : {}),
      };
    }

    case 'focusId': {
      if (effect.id === null) {
        const focusClear: SceneEffect & { kind: 'focus' } = { kind: 'focus', ref: null };
        return focusClear;
      }
      const ref = refOfResolution(resolve.resolveFocusId(effect.id));
      if (ref === null) {
        throw new Error(
          `resolveClipFoci: could not resolve focusId '${effect.id}'. ` +
            `Ensure the readiness gate (clipFociReady) cleared before calling resolveClipFoci.`,
        );
      }
      const focusCue: SceneEffect & { kind: 'focus' } = { kind: 'focus', ref };
      return focusCue;
    }

    default:
      return effect;
  }
}

// ─── Resolution helpers ───────────────────────────────────────────────────────

/** id → ref → row → `arrivalFor`; past the readiness gate a miss is a bug. */
function resolveFraming(
  id: string,
  resolve: SelectionResolver,
  fovYRad: number,
  simDays: number,
): FocusFraming {
  const ref = refOfResolution(resolve.resolveFocusId(id));
  if (ref === null) {
    throw new Error(
      `resolveClipFoci: could not resolve id '${id}' to a selection ref. ` +
        `Ensure the readiness gate (clipFociReady) cleared before calling resolveClipFoci.`,
    );
  }
  const row = resolve.extractRow(ref, simDays);
  if (row === null) {
    throw new Error(
      `resolveClipFoci: id '${id}' resolved to a ref but resolve.extractRow returned null. ` +
        `The catalog row may have unloaded between the readiness check and resolution.`,
    );
  }
  return arrivalFor(row, fovYRad);
}
