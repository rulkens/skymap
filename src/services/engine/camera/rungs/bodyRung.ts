/**
 * The body arm's row. Its climb pair IS `toWorldArm` / `toBodyArm`, called
 * where they live so the graze rule and the Mpc↔metre seam stay one derivation
 * (`poseFrameConversion.ts`, spec §5.1). `host` answers null rather than
 * throwing — `hostOrThrow` is the ladder's single thrower.
 */

import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { toBodyArm, toWorldArm } from '../poseFrameConversion';
import { hostOrThrow } from './hostOrThrow';

export const bodyRung: ClimbRow<'body'> = {
  kind: 'body',
  parent: 'absolute',

  host(frame, ctx) {
    const state = ctx.bodies.get(frame.body);
    const body = SCENE_CELESTIAL_BODIES.find((row) => row.id === frame.body);
    if (state === undefined || body === undefined) return null;
    return { id: frame.body, state, radiusM: body.radiusM };
  },

  toParent(framed, ctx) {
    const host = hostOrThrow(framed.frame, ctx);
    return {
      frame: 'absolute',
      pose: toWorldArm(framed.pose, host.state, ctx.poseBasis, ctx.upBasis, host.radiusM),
    };
  },

  fromParent(parent, frame, ctx) {
    const host = hostOrThrow(frame, ctx);
    return {
      frame,
      pose: toBodyArm(parent.pose, ctx.poseBasis, ctx.upBasis, frame.body, host.state),
    };
  },
};
