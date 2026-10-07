/**
 * `starCatalogPlanner` — the once-scope row: reduce the frame to the GPU cut's
 * inputs and vote awake for `NODE_FADE_MS` after they last changed.
 */
import { describe, it, expect, vi } from 'vitest';

import { starCatalogPlanner } from '../../../src/layers/starCatalog/frame';
import type { StarCatalogRuntime } from '../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCutInputs } from '../../../src/layers/starCatalog/@types/StarCutInputs';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { StarCatalog } from '../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { Source } from '../../../src/data/source';
import { mat4d } from 'wgpu-matrix';
import { EYE_SLACK_MPC, NODE_FADE_MS, PLANE_SLACK } from '../../../src/data/starNodeFade';

const MID_BAND_PC = 1_000; // inside Gaia's crossfade band

function camAtPc(x: number): Vec3 {
  return [x * SCALE_UNITS.PC_TO_MPC, 0, 0];
}

// No `slabs`: the planner reduces such a view to an unpruned cut.
function makeView(camPos: Vec3, nowMs: number): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: camPos,
    drawPxPerRad: 600,
    viewSlot: 0,
    viewKind: 'frame',
  } as unknown as FrameView;
}

function makeRuntime(loaded: boolean): StarCatalogRuntime {
  const catalog = { starCount: 0 } as unknown as StarCatalog;
  let cut: StarCutInputs | null = null;
  return {
    renderer: {
      loadedCatalogs: () =>
        (loaded ? [{ source: Source.GaiaStars, catalog }] : [])[Symbol.iterator](),
      setFrameCut: vi.fn((c: StarCutInputs | null) => {
        cut = c;
      }),
      getFrameCut: () => cut,
    },
  } as unknown as StarCatalogRuntime;
}

const STATE = {
  settings: {
    starCatalogs: {
      enabled: true,
      sizePx: 2.5,
      brightness: 1,
      refineThreshold: 0.05,
      glowOverlap: 1,
      aggregateIntensityCap: 0.06,
      items: { gaiaStars: { enabled: true, labelEnabled: false } },
    },
  },
} as unknown as PassState;
const SNAPSHOT = {} as unknown as ReadyFrameContext;

describe('starCatalogPlanner', () => {
  it('sets one cut per call, and clears it when no source is in band', () => {
    const runtime = makeRuntime(true);
    const planner = starCatalogPlanner(runtime);
    planner.plan(SNAPSHOT, [makeView(camAtPc(MID_BAND_PC), 0)], STATE);
    expect(runtime.renderer.getFrameCut()?.cut.sources).toHaveLength(1);

    const empty = makeRuntime(false);
    const vote = starCatalogPlanner(empty).plan(
      SNAPSHOT,
      [makeView(camAtPc(MID_BAND_PC), 0)],
      STATE,
    );
    expect(empty.renderer.getFrameCut()).toBeNull();
    expect(vote.awake).toBe(false);
  });

  it('stays awake for NODE_FADE_MS after the cut inputs last moved, then sleeps', () => {
    const planner = starCatalogPlanner(makeRuntime(true));
    const plan = (x: number, t: number) => planner.plan(SNAPSHOT, [makeView(camAtPc(x), t)], STATE);

    plan(MID_BAND_PC, 0);
    plan(MID_BAND_PC + 10, 1000); // moved
    expect(plan(MID_BAND_PC + 10, 1000 + NODE_FADE_MS - 1).awake).toBe(true);
    expect(plan(MID_BAND_PC + 10, 1000 + NODE_FADE_MS).awake).toBe(false);
  });

  describe('drift tolerance', () => {
    const FRAME_MS = 8;
    const SLACK_PC = EYE_SLACK_MPC * SCALE_UNITS.MPC_TO_PC;
    const STATE_WITH = (refineThreshold: number) =>
      ({
        settings: {
          starCatalogs: { ...STATE.settings.starCatalogs, refineThreshold },
        },
      }) as unknown as PassState;

    function pruningView(xPc: number, yawRad: number, nowMs: number): FrameView {
      const vp = mat4d.multiply(
        mat4d.perspective(1, 1, 0.1, 100),
        mat4d.rotationY(yawRad),
      ) as Float64Array;
      return { ...makeView(camAtPc(xPc), nowMs), slabs: [{ vp }] } as unknown as FrameView;
    }

    /** Votes for frames 8 ms apart; `pose(i)` gives each frame's eye (pc) and yaw (rad). */
    function votes(
      frames: number,
      pose: (i: number) => { xPc: number; yaw: number },
      state: (i: number) => PassState = () => STATE,
    ): boolean[] {
      const planner = starCatalogPlanner(makeRuntime(true));
      return Array.from({ length: frames }, (_, i) => {
        const { xPc, yaw } = pose(i);
        return planner.plan(SNAPSHOT, [pruningView(xPc, yaw, i * FRAME_MS)], state(i)).awake;
      });
    }
    const afterFade = (v: boolean[]) => v.filter((_, i) => i * FRAME_MS > NODE_FADE_MS);

    it('sleeps through per-frame eye creep and plane wobble far below the slack', () => {
      const v = votes(125, (i) => ({ xPc: MID_BAND_PC + i * 1e-12, yaw: i * 1e-7 }));
      expect(afterFade(v).some(Boolean)).toBe(false);
    });

    it('arms once when accumulated creep crosses the slack, then sleeps again', () => {
      const step = SLACK_PC / 60; // crosses the slack at frame 61 of 100
      const v = votes(100, (i) => ({ xPc: MID_BAND_PC + i * step, yaw: 0 }));
      const fadeFrames = Math.ceil(NODE_FADE_MS / FRAME_MS);
      const awakeFrames = v.flatMap((awake, i) => (awake ? [i] : []));
      // First frame arms; the crossing arms again; nothing else does.
      expect(awakeFrames).toHaveLength(2 * fadeFrames);
      expect(v.slice(fadeFrames, 61)).not.toContain(true);
      expect(v.slice(61 + fadeFrames)).not.toContain(true);
    });

    it('re-arms on a jump past the slack, a frustum turned past the plane slack, or a new threshold', () => {
      const base = { xPc: MID_BAND_PC, yaw: 0 };
      const at = (change: (i: number) => { xPc: number; yaw: number }, state = STATE) =>
        votes(
          60,
          (i) => (i < 40 ? base : change(i)),
          (i) => (i < 40 ? STATE : state),
        )[41];
      expect(at(() => ({ ...base, xPc: MID_BAND_PC + SLACK_PC * 2 }))).toBe(true);
      expect(at(() => ({ ...base, yaw: PLANE_SLACK * 4 }))).toBe(true);
      expect(at(() => base, STATE_WITH(0.07))).toBe(true);
      expect(at(() => base)).toBe(false);
    });
  });
});
