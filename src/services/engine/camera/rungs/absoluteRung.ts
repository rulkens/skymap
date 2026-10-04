/** The world arm's row — the ladder's floor: nothing to climb to, and no host body its numbers hang off. */
import type { RungRow } from '../../../../@types/camera/RungRow';
import { absoluteArm } from '../../../../utils/camera/absoluteArm';
import { nudgedWorldPose } from '../../../../utils/camera/nudgedWorldPose';
import { applyInputToCamera } from '../../../camera/applyInputToCamera';
import { frameAlignedRoll } from '../frameAlignedRoll';

export const absoluteRung: RungRow<'absolute'> = {
  kind: 'absolute',
  host: () => null,
  emptyMemory: null,

  // This arm's channels ARE its pose, so both cells hand theirs back by reference.
  channels: {
    encode: (world) => world,
    decode: (channels) => absoluteArm(channels),
  },

  step(_memory, tilt, framed, input, ctx) {
    // A pointer edge moves no pose and this arm keeps no gesture register, so
    // it answers with its input pose by reference.
    if (input.kind !== 'drag' && input.kind !== 'zoom') {
      return { pose: framed.pose, memory: null, tilt };
    }
    const next = applyInputToCamera(
      framed.pose,
      input,
      // CSS height, not the backing store: gesture feel must not read the DPR.
      ctx.viewportPx[1],
      ctx.pivot,
      ctx.fovYRad,
      ctx.poseBasis,
      ctx.upBasis,
    );
    if (input.kind !== 'zoom') return { pose: next, memory: null, tilt };
    // The roll ride runs on every driven zoom path, gesture-held included.
    const roll = frameAlignedRoll(
      framed.pose,
      next,
      ctx.bodies,
      ctx.poseBasis,
      ctx.upBasis,
      Math.abs(Math.log(input.factor)),
      ctx.tuning,
    );
    return { pose: { ...next, roll }, memory: null, tilt };
  },
  nudge(tilt, framed, delta, ctx) {
    const { zoom, ...rest } = delta;
    // Zoom IS the wheel step, roll ride included, so a nudge cannot pop at the engage flip.
    const zoomed =
      zoom === undefined
        ? framed.pose
        : absoluteRung.step(
            null,
            tilt,
            framed,
            { kind: 'zoom', factor: Math.exp(zoom), duringGesture: false, cursorPx: null },
            ctx,
          ).pose;
    return {
      pose: nudgedWorldPose(
        zoomed,
        rest,
        ctx.viewportPx[1],
        ctx.pivot,
        ctx.fovYRad,
        ctx.poseBasis,
        ctx.upBasis,
      ),
      tilt,
    };
  },
};
