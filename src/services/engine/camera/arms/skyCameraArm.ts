/**
 * The sky arm's row (spec §4): a person standing SKY_EYE_HEIGHT_M above the
 * live ground at the tag's spot, looking by azimuth and altitude. Only a tag
 * enters it (`engage` is null), and this slice authors no input: `step` and
 * `nudge` decline by reference until sky mode fills them.
 */

import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import { focusInSubtree } from '../../../../utils/camera/focusInSubtree';
import { skyPoseFromBodyArm } from '../../../../utils/camera/skyPoseFromBodyArm';
import { skyPoseToBodyArm } from '../../../../utils/camera/skyPoseToBodyArm';
import { skySpotRadial } from '../../../../utils/geo/skySpotRadial';
import { hostOf } from './hostOf';
import { hostOrThrow } from './hostOrThrow';
import { isSkyArm } from './isSkyArm';
import { refoldTo } from './refoldTo';

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

  step: (memory, tilt, framed) => ({ pose: framed.pose, memory, tilt }),

  nudge: (tilt, framed) => ({ pose: framed.pose, tilt }),

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

  release: (framed, ctx) => !focusInSubtree(ctx.focusBodyId, framed.frame.sky.body),
};
