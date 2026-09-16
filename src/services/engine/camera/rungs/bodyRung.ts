/**
 * The body arm's row. Its climb pair IS `toWorldArm` / `toBodyArm`, called
 * where they live so the graze rule and the Mpc↔metre seam stay one derivation
 * (`poseFrameConversion.ts`, spec §5.1). `host` answers null rather than
 * throwing — `hostOrThrow` is the ladder's single thrower. The band cells read
 * geometry AND focus, never a stored flag: hysteresis falls out of which cell
 * is asked, `engage` from the parent and `release` from this arm, so a body a
 * differing focus would release next frame is never entered either.
 */

import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import { EMPTY_SURFACE_GESTURE_MEMORY, surfaceStep } from '../../../camera/surfaceStep';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { bodyFixedEyeM } from '../../../../utils/camera/bodyFixedEyeM';
import { decodeBodyFixedChannels } from '../../../../utils/camera/decodeBodyFixedChannels';
import { eyeMpcOf } from '../../../../utils/camera/eyeMpcOf';
import { focusInSubtree } from '../../../../utils/camera/focusInSubtree';
import { frameUp } from '../../../../utils/camera/frameUp';
import { hostedFocusOverHorizon } from '../../../../utils/camera/hostedFocusOverHorizon';
import { hostedFocusPivotM } from '../../../../utils/camera/hostedFocusPivotM';
import { toBodyFixedChannels } from '../../../../utils/camera/toBodyFixedChannels';
import { rotateVec3ByTightMat3T } from '../../../../utils/math/rotateVec3ByTightMat3T';
import { surfaceGestureEdge } from '../../../../utils/camera/surfaceGestureEdge';
import { bodyStandoffRadii } from '../../../../utils/scene/bodyStandoffRadii';
import { hOverR } from '../hOverR';
import { nearestBodyHR } from '../nearestBodyHR';
import { toBodyArm, toWorldArm } from '../poseFrameConversion';
import { hostOf } from './hostOf';
import { hostOrThrow } from './hostOrThrow';

export const bodyRung: ClimbRow<'body'> = {
  kind: 'body',
  parent: 'absolute',
  emptyMemory: EMPTY_SURFACE_GESTURE_MEMORY,

  /**
   * A clip leg's channels in this body's FIXED axes, crossed ONCE per leg and
   * never per frame — re-crossing each frame would walk the leg's start along
   * with the body. The pair is lossless in the eye and the basis but carries no
   * orbit pivot, so a round trip may slide the target along the sightline.
   */
  channels: {
    encode: (world, frame, ctx) =>
      toBodyFixedChannels(world, frame.body, ctx.bodies, ctx.poseBasis),
    decode: (channels, frame) => ({
      frame,
      pose: decodeBodyFixedChannels(channels, frame.body),
    }),
  },

  host(frame, ctx) {
    const state = ctx.bodies.get(frame.body);
    const body = SCENE_CELESTIAL_BODIES.find((row) => row.id === frame.body);
    if (state === undefined || body === undefined) return null;
    return {
      id: frame.body,
      state,
      radiusM: body.surface.datumRadiusM,
      // F3a returns `datum + terrainHeightM(dir)` here (spec §8.3); until then
      // every direction answers the datum, so the floor is where it always was.
      groundRadiusAtM: () => body.surface.datumRadiusM,
      standoffRadii: bodyStandoffRadii(body),
    };
  },

  step(memory, tilt, framed, input, ctx) {
    // The pointer edge is the only thing that latches or drops a surface gesture,
    // and it moves no pose — so it answers with its input pose by reference.
    if (input.kind === 'gestureStart' || input.kind === 'gestureEnd') {
      return {
        pose: framed.pose,
        memory: surfaceGestureEdge(input.kind === 'gestureStart'),
        tilt,
      };
    }
    const host = hostOrThrow(framed.frame, ctx);
    const stepped = surfaceStep(memory, tilt, framed.pose, input, {
      viewportPx: ctx.viewportPx,
      fovYRad: ctx.fovYRad,
      bodyRadiusM: host.radiusM,
      standoffRadii: host.standoffRadii,
      groundRadiusAtM: host.groundRadiusAtM,
      // The body rotates under the scene frame, so this is resampled per drain.
      sceneUpLocal: rotateVec3ByTightMat3T(frameUp(ctx.upBasis), host.state.orientation),
      // Derived from the FOCUS every drain, never carried in the pose: a
      // carried anchor decouples from the rover as soon as a drag turns the arm.
      focusPivotM: hostedFocusPivotM(ctx.focusBodyId, host.id, host.radiusM),
      tuning: ctx.tuning,
    });
    return { pose: stepped.pose, memory: stepped.gesture, tilt: stepped.tilt };
  },

  toParent(framed, ctx) {
    const host = hostOrThrow(framed.frame, ctx);
    return {
      frame: 'absolute',
      pose: toWorldArm(
        framed.pose,
        host.state,
        ctx.poseBasis,
        ctx.upBasis,
        host.radiusM,
        host.standoffRadii,
        host.groundRadiusAtM,
      ),
    };
  },

  fromParent(parent, frame, ctx) {
    const host = hostOrThrow(frame, ctx);
    return {
      frame,
      pose: toBodyArm(parent.pose, ctx.poseBasis, ctx.upBasis, frame.body, host.state),
    };
  },

  engage(parent, ctx) {
    const nearest = nearestBodyHR(eyeMpcOf(parent.pose, ctx.poseBasis), ctx.bodies);
    // Clip/tour reachability (R10-1): a hand-authored `flyToClip` CAN park at one
    // body's surface with a stale focus on another. No engage happens there, so
    // the first at-rest frame's pivot pin re-targets the FOCUSED body.
    if (
      nearest === null ||
      nearest.hr >= ctx.tuning.engageHR ||
      !focusInSubtree(ctx.focusBodyId, nearest.bodyId)
    ) {
      return null;
    }
    // The horizon test from the parent side, so an arm `release` would hand back
    // next frame is never entered: an approach to a rover on the far side crosses
    // this band, and without this it flips regime on every frame of the crossing.
    const host = hostOrThrow({ body: nearest.bodyId }, ctx);
    const arm = toBodyArm(parent.pose, ctx.poseBasis, ctx.upBasis, host.id, host.state);
    return hostedFocusOverHorizon(bodyFixedEyeM(arm), ctx.focusBodyId, host)
      ? null
      : { body: nearest.bodyId };
  },

  release(framed, ctx) {
    // A focus OUTSIDE this body's subtree releases the arm so follow can take
    // over next frame; one hosted on it — a rover — keeps it (§4.8).
    if (!focusInSubtree(ctx.focusBodyId, framed.frame.body)) return true;
    // Unresolved this frame: hold rather than guess — the caller's next frame retries.
    const host = hostOf(framed.frame, ctx);
    if (host === null) return false;
    // ...but only while the arm can SERVE it: nothing moves the camera from
    // inside a body arm (the pin and the follow pair are both inert here), so a
    // hold past the horizon strands a switch between two rovers forever.
    if (hostedFocusOverHorizon(bodyFixedEyeM(framed.pose), ctx.focusBodyId, host)) return true;
    const world = toWorldArm(
      framed.pose,
      host.state,
      ctx.poseBasis,
      ctx.upBasis,
      host.radiusM,
      host.standoffRadii,
      host.groundRadiusAtM,
    );
    return (
      hOverR(eyeMpcOf(world, ctx.poseBasis), host.state, host.radiusM) > ctx.tuning.disengageHR
    );
  },
};
