/**
 * engageFlipPop — a focused zoom-IN through the engage flip must hand the
 * orientation settle over seamlessly. A two-curve seam (world roll target
 * keyed to `maxTiltRad`, engaged reference to `bodyUpWeight`) would make the
 * target jump ~0.12 rad AT the flip, which the capped decay would then walk
 * out over ~8 notches — an end-of-dive roll pop. The measure is image turn per
 * unit of blend WEIGHT: the unified field spends a fixed angle per unit w, so
 * that ratio is flat across the conversion and a seam's unauthored target move
 * shows up as a burst in it.
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
import { hrOfPose } from '../../../helpers/camera/hrOfPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { bodyUpWeight } from '../../../../src/utils/camera/bodyUpWeight';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENT_DECAY } from '../../../../src/data/camera/orientDecay';
import { ORIENT_TUNING } from '../../../../src/data/camera/orientTuning';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const TUNING_AT_LOAD = { ...ORIENT_TUNING };
const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const EARTH = deriveBodyStates(CONST_J2000).get('earth')! as BodyState;
/** The script drives deltaY-100 notches — the settle's calibration point. */
const NOTCH_CAP = ORIENT_DECAY.capRadPerLogZoom * ORIENT_DECAY.notchLogZoom;

type FrameSample = { readonly arm: string; readonly up: Vec3; readonly w: number };

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
    arm: state.cameraRuntime.register.pose.frame === 'absolute' ? 'abs' : 'body',
    up: [...up] as Vec3,
    w: bodyUpWeight(hrOfPose(eye, EARTH, SCENE_EARTH.radiusM)),
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
      // Only the frames whose notch spent real weight: the ratio below divides
      // by it, so frames between notches (dw = 0) and the tail past the band's
      // full edge (w pinned at 1) leave it undefined or ill-conditioned.
      const notches: { readonly i: number; readonly rate: number }[] = [];
      for (let i = 1; i < samples.length; i += 1) {
        const dw = samples[i]!.w - samples[i - 1]!.w;
        if (dw > 1e-3) notches.push({ i, rate: turnBetween(samples[i - 1]!, samples[i]!) / dw });
      }
      const flipAt = notches.findIndex((n) => n.i === flipIdx);
      expect(flipAt).toBeGreaterThan(0);

      // No whip anywhere near engage — the ruled per-notch envelope.
      expect(maxPre).toBeLessThanOrEqual(ORIENT_DECAY.rideBoundRad + 2 * NOTCH_CAP + 0.02);
      // Seamless hand-off: the conversion notch spends the SAME image turn per
      // unit weight as the world-armed notch before it (0.268 rad/w on this
      // dive, both spaces — the pole↔scene-up separation at the locus). A
      // two-curve seam mints ~0.12 rad of unauthored target there, ~3.5× the
      // rate. The tilt band now runs well below engage, so the blend keeps
      // turning the image after the flip — a quiet post-window is no longer
      // the signal, this rate is.
      const preRate = notches[flipAt - 1]!.rate;
      expect(notches[flipAt]!.rate).toBeCloseTo(preRate, 1);
      // And the whole post-flip window, normalized by the weight it spent: the
      // engaged settle LAGS the field (0.25 share at this notch) and re-converges,
      // so this sits just under the notch rate — 0.25 rad/w here. A seam's
      // capped walk-out would spend its fresh 0.119 rad on top, ~1.4×.
      let cumPost = 0;
      for (let i = flipIdx + 1; i < samples.length; i += 1) {
        cumPost += turnBetween(samples[i - 1]!, samples[i]!);
      }
      const spent = samples[samples.length - 1]!.w - samples[flipIdx]!.w;
      expect(cumPost / spent).toBeLessThan(preRate * 1.25);
    },
  );
});
