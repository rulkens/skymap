/**
 * engageFlipPop — round-8 regression at the user's altitude (the engage
 * neighbourhood): a focused zoom-IN through the flip must hand the
 * orientation settle over seamlessly. The pre-fix two-curve seam (world roll
 * target keyed to `maxTiltRad`, engaged reference to `bodyUpWeight`) made the
 * target jump ~0.12 rad AT the flip, which the capped decay then walked out
 * over ~8 notches — the end-of-dive roll pop. Windowed assertions, not a
 * single-notch rate check: the conversion notch itself carries a legitimate
 * bounded settle step; the defect is the burst AFTER it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { driveWheelEvents } from '../../../helpers/camera/driveWheelEvents';
import { displayedEye } from '../../../helpers/camera/displayedEye';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENT_DECAY } from '../../../../src/data/camera/orientDecay';
import { ORIENT_TUNING } from '../../../../src/data/camera/orientTuning';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const TUNING_AT_LOAD = { ...ORIENT_TUNING };
const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];

type FrameSample = { readonly arm: string; readonly up: Vec3 };

function sampleOf(state: EngineState): FrameSample {
  const live = liveWorldPose(state);
  const eye = displayedEye(state);
  const forward = normalize3([
    live.target[0]! - eye[0],
    live.target[1]! - eye[1],
    live.target[2]! - eye[2],
  ] as Vec3);
  const { up } = imagePlaneBasis(forward, live.roll ?? 0, frameUp(B));
  return {
    arm: state.cameraRuntime.lastPose.current.frame === 'absolute' ? 'abs' : 'body',
    up: [...up] as Vec3,
  };
}

function turnBetween(a: FrameSample, b: FrameSample): number {
  const d = a.up[0]! * b.up[0]! + a.up[1]! * b.up[1]! + a.up[2]! * b.up[2]!;
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

describe('engage-flip pop (round 8)', () => {
  afterEach(() => {
    ORIENT_TUNING.blendSpace = TUNING_AT_LOAD.blendSpace;
  });

  // Both blend spaces (ruling 11): the seam guard must hold whichever
  // parameter space the one-home weight runs in.
  it.each(['log', 'lin'] as const)(
    'a focused dive through engage settles monotonically — no post-flip burst (%s space)',
    (space) => {
      ORIENT_TUNING.blendSpace = space;
      const h = makeCameraSimHarness();
      const events: { t: number; deltaY: number }[] = [];
      let t = 1000; // the follow approach settles at the framing distance first
      for (let i = 0; i < 60; i += 1, t += 33) events.push({ t, deltaY: -100 });
      const endT = t + 2000;

      const samples: FrameSample[] = [];
      driveWheelEvents(h, events, endT, { onFrame: () => samples.push(sampleOf(h.state)) });

      const flipIdx = samples.findIndex(
        (s, i) => i > 0 && s.arm === 'body' && samples[i - 1]!.arm === 'abs',
      );
      expect(flipIdx).toBeGreaterThan(0); // the dive really crossed engage

      let maxPre = 0; // per-frame turns while the world arm still owned the dive
      for (let i = 1; i < flipIdx; i += 1) {
        maxPre = Math.max(maxPre, turnBetween(samples[i - 1]!, samples[i]!));
      }
      let maxPost = 0;
      let cumPost = 0; // total image turn AFTER the conversion notch
      for (let i = flipIdx + 1; i < samples.length; i += 1) {
        const turn = turnBetween(samples[i - 1]!, samples[i]!);
        maxPost = Math.max(maxPost, turn);
        cumPost += turn;
      }

      // No whip anywhere near engage — the ruled per-notch envelope.
      expect(maxPre).toBeLessThanOrEqual(
        ORIENT_DECAY.rideBoundRad + 2 * ORIENT_DECAY.capRad + 0.02,
      );
      // Monotone hand-off: the engaged settle may only CONTINUE the world arm's
      // convergence, never open a fresh residual. Pre-fix: 0.030 > 0.024 (the
      // flip minted ~0.12 rad of new deviation from the target-curve seam).
      expect(maxPost).toBeLessThanOrEqual(maxPre + 1e-3);
      // The pop itself: pre-fix the post-flip window walked 0.119 rad
      // (unified field: 1.8e-4 — the flip finds no fresh residual to spend).
      expect(cumPost).toBeLessThan(0.01);
    },
  );
});
