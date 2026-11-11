/**
 * The sky arm's row (look-around spec §4): a person standing SKY_EYE_HEIGHT_M above the
 * live ground at the tag's spot, looking by azimuth and altitude. Only a tag
 * enters it (`engage` is null). Every drag looks and the wheel changes the
 * lens, which the arm hands back as `fovYRad` beside an unmoved pose; a wheel-out at the
 * widest lens, or a `liftOff` step, reports a push carrying the exit lift.
 */

import type { ClimbRow } from '../@types/ClimbRow';
import type { Vec2 } from '../../../../../@types/math/Vec2';
import { focusInSubtree } from '../../../../../utils/camera/arms/focusInSubtree';
import { skyPoseFromBodyArm } from './utils/skyPoseFromBodyArm';
import { skyPoseToBodyArm } from './utils/skyPoseToBodyArm';
import { skySpotRadial } from '../../../../../utils/geo/skySpotRadial';
import { hostOf } from '../hostOf';
import { hostOrThrow } from '../hostOrThrow';
import { isSkyArm } from './isSkyArm';
import { refoldTo } from '../refoldTo';
import { skyLookedPose } from './utils/skyLookedPose';
import { skyZoomedLens } from './utils/skyZoomedLens';
import { skyExitLift } from './utils/skyExitLift';

export const skyCameraArm: ClimbRow<'sky'> = {
  kind: 'sky',
  parent: 'body',
  emptyMemory: null,

  channels: {
    // The tag names the spot, so `target` and `distance` carry nothing, as at a site.
    encode: (world, frame, ctx) => {
      const framed = refoldTo({ frame: 'absolute', pose: world }, frame, ctx);
      if (!isSkyArm(framed)) throw new Error('skyCameraArm: refoldTo did not land the sky frame');
      return {
        target: [0, 0, 0],
        yaw: framed.pose.azimuthRad,
        pitch: framed.pose.altitudeRad,
        distance: 0,
      };
    },
    decode: (channels, frame) => ({
      frame,
      pose: { azimuthRad: channels.yaw, altitudeRad: channels.pitch },
    }),
  },

  identity: ({ sky }) => `${sky.body},${String(sky.lonRad)},${String(sky.latRad)}`,

  host: (frame, ctx) => hostOf({ body: frame.sky.body }, ctx),

  step(memory, tilt, framed, input, ctx) {
    if (input.kind === 'drag') {
      const dragPx: Readonly<Vec2> = [
        input.endPx[0] - input.startPx[0],
        input.endPx[1] - input.startPx[1],
      ];
      const pose = skyLookedPose(framed.pose, dragPx, ctx.fovYRad, ctx.viewportPx[1]);
      return { pose, memory, tilt };
    }
    if (input.kind === 'zoom') {
      const fovYRad = skyZoomedLens(ctx.fovYRad, input.factor);
      // The pose stays by reference, so `replayInput` commits no pose for a lens notch.
      if (fovYRad !== ctx.fovYRad) return { pose: framed.pose, memory, tilt, fovYRad };
    }
    // A wheel-out the widest lens ate whole presses the limit; the drain decides whether it
    // pushes. The lift rides the push as a value; once played, its end commit (a body-arm
    // pose) leaves the sky.
    const lifts = input.kind === 'liftOff' || (input.kind === 'zoom' && input.factor > 1);
    if (!lifts) return { pose: framed.pose, memory, tilt };
    return {
      pose: framed.pose,
      memory,
      tilt,
      pressed: { edge: 'out', lift: skyExitLift(framed, ctx) },
    };
  },

  nudge(tilt, framed, { look, zoom }, ctx) {
    const pxPerRad = ctx.viewportPx[1] / ctx.fovYRad;
    const pose =
      look === undefined
        ? framed.pose
        : skyLookedPose(
            framed.pose,
            [look[0] * pxPerRad, look[1] * pxPerRad],
            ctx.fovYRad,
            ctx.viewportPx[1],
          );
    const fovYRad = zoom === undefined ? ctx.fovYRad : skyZoomedLens(ctx.fovYRad, Math.exp(zoom));
    return fovYRad === ctx.fovYRad ? { pose, tilt } : { pose, tilt, fovYRad };
  },

  toParent(framed, ctx) {
    const host = hostOrThrow(framed.frame, ctx);
    const spot = framed.frame.sky;
    return {
      frame: { body: host.id },
      pose: skyPoseToBodyArm(framed.pose, spot, host.groundRadiusAtM(skySpotRadial(spot))),
    };
  },

  fromParent: (parent, frame) => ({ frame, pose: skyPoseFromBodyArm(parent.pose, frame.sky) }),

  engage: () => null,

  // A tag carries no eye, so focus is the only way out: a bodiless one leaves too, or a fly to
  // a galaxy would refold into this frame every frame and its end commit would land on the ground.
  release: (framed, ctx) =>
    ctx.bodilessFocus || !focusInSubtree(ctx.focusBodyId, framed.frame.sky.body),
};
