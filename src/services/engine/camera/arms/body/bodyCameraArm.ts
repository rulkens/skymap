/**
 * The body arm's row. Its climb pair IS `toWorldArm` / `toBodyArm`, called
 * where they live so the graze rule and the Mpc↔metre seam stay one derivation
 * (`poseFrameConversion.ts`, spec §5.1). `host` answers null rather than
 * throwing — `hostOrThrow` is the arm tree's single thrower. The band cells read
 * geometry AND focus, never a stored flag: hysteresis falls out of which cell
 * is asked, `engage` from the parent and `release` from this arm, so a body a
 * differing focus would release next frame is never entered either.
 */

import type { ClimbRow } from '../@types/ClimbRow';
import type { HostBody } from '../@types/HostBody';
import type { CameraArmCtx } from '../../../../../@types/camera/arms/CameraArmCtx';
import type { SurfaceStepCtx } from './@types/SurfaceStepCtx';
import { EMPTY_SURFACE_GESTURE_MEMORY, surfaceStep } from './gesture/surfaceStep';
import { SCENE_CELESTIAL_BODIES } from '../../../../../data/bodies/sceneCelestialBodies';
import { bodyFixedEyeM } from '../../../../../utils/camera/surfaceFrame/bodyFixedEyeM';
import { decodeBodyFixedChannels } from './utils/decodeBodyFixedChannels';
import { eyeMpcOf } from '../../../../../utils/camera/orbitPose/eyeMpcOf';
import { focusInSubtree } from '../../../../../utils/camera/arms/focusInSubtree';
import { frameUp } from '../../../../../utils/camera/orbitPose/frameUp';
import { hostedFocusOverHorizon } from './utils/hostedFocusOverHorizon';
import { hostedFocusPivotM } from './utils/hostedFocusPivotM';
import { nudgedSurfacePose } from './gesture/utils/nudgedSurfacePose';
import { toBodyFixedChannels } from './toBodyFixedChannels';
import { rotateByTranspose } from '../../../../../utils/math/rotateByTranspose';
import { surfaceGestureEdge } from './gesture/utils/surfaceGestureEdge';
import { innerBoundRadiusM } from '../../../../../utils/occlusion/innerBoundRadiusM';
import { outerBoundRadiusM } from '../../../../../utils/occlusion/outerBoundRadiusM';
import { bodyStandoffRadii } from '../../../../../utils/scene/bodyStandoffRadii';
import { hOverR } from '../../bodyFrame/hOverR';
import { nearestBodyHR } from '../../bodyFrame/nearestBodyHR';
import { toBodyArm, toWorldArm } from './poseFrameConversion';
import { hostOf } from '../hostOf';
import { hostOrThrow } from '../hostOrThrow';
import { bodyGroundRadiusAtM } from '../../../../../utils/scene/bodyGroundRadiusAtM';
import { eyeAtFloor } from './utils/eyeAtFloor';
import { skySpotAt } from '../../../../../utils/geo/skySpotAt';

function surfaceStepCtxOf(host: HostBody, ctx: CameraArmCtx): SurfaceStepCtx {
  return {
    viewportPx: ctx.viewportPx,
    frustum: ctx.frustum,
    fovYRad: ctx.fovYRad,
    bodyRadiusM: host.radiusM,
    standoffRadii: host.standoffRadii,
    groundRadiusAtM: host.groundRadiusAtM,
    innerBoundRadiusM: host.innerBoundRadiusM,
    outerBoundRadiusM: host.outerBoundRadiusM,
    // The body rotates under the scene frame, so this is resampled per drain.
    sceneUpLocal: rotateByTranspose(host.state.orientation, frameUp(ctx.upBasis)),
    // Derived from the FOCUS every drain, never carried in the pose: a
    // carried anchor decouples from the rover as soon as a drag turns the arm.
    focusPivotM: hostedFocusPivotM(ctx.focusBodyId, host.id, host.radiusM),
    tuning: ctx.tuning,
  };
}

export const bodyCameraArm: ClimbRow<'body'> = {
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

  identity: (frame) => frame.body,

  host(frame, ctx) {
    const state = ctx.bodies.get(frame.body);
    const body = SCENE_CELESTIAL_BODIES.find((row) => row.id === frame.body);
    if (state === undefined || body === undefined) return null;
    return {
      id: frame.body,
      state,
      radiusM: body.surface.datumRadiusM,
      groundRadiusAtM: (dir) => bodyGroundRadiusAtM(body, ctx.terrainHeightAt(frame.body, dir)),
      innerBoundRadiusM: innerBoundRadiusM(body.surface),
      outerBoundRadiusM: outerBoundRadiusM(body.surface),
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
    const surfaceCtx = surfaceStepCtxOf(hostOrThrow(framed.frame, ctx), ctx);
    const stepped = surfaceStep(memory, tilt, framed.pose, input, surfaceCtx);
    const result = { pose: stepped.pose, memory: stepped.gesture, tilt: stepped.tilt };
    // A zoom-in that STARTS on the floor presses it, sliding or not (spec §4.2): at the floor
    // the view is oblique, so a notch is rarely eaten whole. The drain decides if it pushes.
    const anchorM = stepped.zoomAnchorM;
    const pushes =
      input.kind === 'zoom' &&
      input.factor < 1 &&
      anchorM !== null &&
      eyeAtFloor(framed.pose, surfaceCtx.groundRadiusAtM, surfaceCtx.standoffRadii);
    if (!pushes) return result;
    const spot = skySpotAt(framed.frame.body, anchorM);
    return { ...result, pushed: { edge: 'in', spot, pointLocalM: anchorM } };
  },

  nudge(tilt, framed, delta, ctx) {
    const surfaceCtx = surfaceStepCtxOf(hostOrThrow(framed.frame, ctx), ctx);
    return nudgedSurfacePose(framed.pose, tilt, delta, surfaceCtx);
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
