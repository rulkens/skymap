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
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { eyeMpcOf } from '../../../../utils/camera/eyeMpcOf';
import { hOverR } from '../hOverR';
import { nearestBodyHR } from '../nearestBodyHR';
import { toBodyArm, toWorldArm } from '../poseFrameConversion';
import { hostOf } from './hostOf';
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

  engage(parent, ctx) {
    const nearest = nearestBodyHR(eyeMpcOf(parent.pose, ctx.poseBasis), ctx.bodies);
    // Clip/tour reachability (R10-1): a hand-authored `flyToClip` CAN park at one
    // body's surface with a stale focus on another. No engage happens there, so
    // the first at-rest frame's pivot pin re-targets the FOCUSED body.
    return nearest !== null &&
      nearest.hr < ctx.tuning.engageHR &&
      (ctx.focusBodyId === null || ctx.focusBodyId === nearest.bodyId)
      ? { body: nearest.bodyId }
      : null;
  },

  release(framed, ctx) {
    // A differing body focus releases the arm so follow can take over next frame.
    if (ctx.focusBodyId !== null && ctx.focusBodyId !== framed.frame.body) return true;
    // Unresolved this frame: hold rather than guess — the caller's next frame retries.
    const host = hostOf(framed.frame, ctx);
    if (host === null) return false;
    const world = toWorldArm(framed.pose, host.state, ctx.poseBasis, ctx.upBasis, host.radiusM);
    return (
      hOverR(eyeMpcOf(world, ctx.poseBasis), host.state, host.radiusM) > ctx.tuning.disengageHR
    );
  },
};
