/**
 * `starCatalogPlanner` — the once-scope row: reduce the frame to the GPU cut's
 * inputs and vote awake for `NODE_FADE_MS` after they last changed.
 */
import { describe, it, expect, vi } from 'vitest';
import { ZERO_FOCUS } from '../../../src/services/engine/subsystems/structureFocusSubsystem';

import { planStarChunks } from '../../../src/utils/star/planStarChunks';
import { starCatalogPlanner } from '../../../src/layers/starCatalog/frame';
import type { StarCatalogRuntime } from '../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCutInputs } from '../../../src/layers/starCatalog/@types/StarCutInputs';
import type { StarChunkStream } from '../../../src/layers/starCatalog/@types/StarChunkStream';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { StarOctree } from '../../../src/@types/data/starCatalog/StarOctree';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { Source } from '../../../src/data/source';
import { mat4d } from 'wgpu-matrix';
import { makeSlab } from '../../fixtures/makeSlab';
import { STAR_PLAN_INTERVAL_FRAMES } from '../../../src/data/starPlanIntervalFrames';
import { EYE_SLACK_MPC, NODE_FADE_MS } from '../../../src/data/starNodeFade';

// The star entry's handed value with every catalog fully faded in.
const ALL_ON = { famousStar: 1, gaiaStars: 1, sStar: 1, sun: 1 } as const;

vi.mock('../../../src/utils/star/planStarChunks', async (original) => {
  const { planStarChunks: real } =
    await original<typeof import('../../../src/utils/star/planStarChunks')>();
  return { planStarChunks: vi.fn(real) };
});

const MID_BAND_PC = 1_000; // inside Gaia's crossfade band

function camAtPc(x: number): Vec3 {
  return [x * SCALE_UNITS.PC_TO_MPC, 0, 0];
}

function makeView(camPos: Vec3, nowMs: number): FrameView {
  return {
    snapshot: { nowMs, focus: ZERO_FOCUS },
    drawCamPos: camPos,
    drawPxPerRad: 600,
    viewSlot: 0,
    viewKind: 'frame',
    slabs: [makeSlab()],
  } as unknown as FrameView;
}

function makeRuntime(loaded: boolean, stream?: StarChunkStream): StarCatalogRuntime {
  // An empty index: the chunk planner walks nothing, so a stubbed stream's counters drive the vote.
  const catalog = {
    starCount: 0,
    grid: { bits: 10, origin: [0, 0, 0], cellEdge: 1 },
    nodes: { count: 0 },
    chunks: [],
    chunkCount: 0,
  } as unknown as StarOctree;
  let cut: StarCutInputs | null = null;
  return {
    chunkStreams: new Map(stream ? [[Source.GaiaStars, stream]] : []),
    renderer: {
      loadedCatalogs: () =>
        (loaded ? [{ source: Source.GaiaStars, octree: catalog }] : [])[Symbol.iterator](),
      setFrameCut: vi.fn((c: StarCutInputs | null) => {
        cut = c;
      }),
      getFrameCut: () => cut,
    },
    catalogs: new Map([
      [
        Source.GaiaStars,
        { committed: () => ({ req: { source: Source.GaiaStars, tier: 'medium' } }) },
      ],
    ]),
  } as unknown as StarCatalogRuntime;
}

const STATE = {
  settings: {
    starCatalogs: {
      sizePx: 2.5,
      brightness: 1,
      refineThreshold: 0.05,
      glowOverlap: 1,
      aggregateIntensityCap: 0.06,
      chunkSlotsOverride: null,
    },
  },
} as unknown as PassState;
const SNAPSHOT = {} as unknown as ReadyFrameContext;

describe('starCatalogPlanner', () => {
  it('sets one cut per call, and clears it when no source is in band', () => {
    const runtime = makeRuntime(true);
    const planner = starCatalogPlanner(runtime);
    planner.plan(SNAPSHOT, [makeView(camAtPc(MID_BAND_PC), 0)], STATE, ALL_ON);
    expect(runtime.renderer.getFrameCut()?.cut.sources).toHaveLength(1);

    const empty = makeRuntime(false);
    const vote = starCatalogPlanner(empty).plan(
      SNAPSHOT,
      [makeView(camAtPc(MID_BAND_PC), 0)],
      STATE,
      ALL_ON,
    );
    expect(empty.renderer.getFrameCut()).toBeNull();
    expect(vote.awake).toBe(false);
  });

  it('stays awake for NODE_FADE_MS after the cut inputs last moved, then sleeps', () => {
    const planner = starCatalogPlanner(makeRuntime(true));
    const plan = (x: number, t: number) =>
      planner.plan(SNAPSHOT, [makeView(camAtPc(x), t)], STATE, ALL_ON);

    plan(MID_BAND_PC, 0);
    plan(MID_BAND_PC + 10, 1000); // moved
    expect(plan(MID_BAND_PC + 10, 1000 + NODE_FADE_MS - 1).awake).toBe(true);
    expect(plan(MID_BAND_PC + 10, 1000 + NODE_FADE_MS).awake).toBe(false);
  });

  it('re-cuts every other frame while the cut moves, every frame at rest, and at once on a landing', () => {
    const counters = { epoch: 0 };
    const stream = {
      update: vi.fn(),
      resident: () => null,
      hasFailed: () => false,
      inFlightCount: () => 0,
      epoch: () => counters.epoch,
    } as unknown as StarChunkStream;
    const runtime = makeRuntime(true, stream);
    const planner = starCatalogPlanner(runtime);
    const recut = (x: number, t: number) => {
      planner.plan(SNAPSHOT, [makeView(camAtPc(x), t)], STATE, ALL_ON);
      return vi.mocked(runtime.renderer.setFrameCut).mock.calls.at(-1)![1];
    };

    expect(recut(MID_BAND_PC, 0)).toBe(true);
    expect([1, 2, 3, 4].map((i) => recut(MID_BAND_PC + 10 * i, 16 * i))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect([5, 6].map((i) => recut(MID_BAND_PC + 40, 16 * i))).toEqual([true, true]);
    recut(MID_BAND_PC + 50, 16 * 7); // moved after a cut: skipped
    counters.epoch = 1;
    expect(recut(MID_BAND_PC + 60, 16 * 8)).toBe(true);
  });

  describe('chunk residency', () => {
    function stubStream() {
      const counters = { inFlight: 0, epoch: 0 };
      const stream = {
        update: vi.fn(),
        resident: () => null,
        hasFailed: () => false,
        inFlightCount: () => counters.inFlight,
        epoch: () => counters.epoch,
      } as unknown as StarChunkStream;
      return { stream, counters };
    }

    it('stays awake while a chunk is in flight', () => {
      const { stream, counters } = stubStream();
      const planner = starCatalogPlanner(makeRuntime(true, stream));
      const plan = (t: number) =>
        planner.plan(SNAPSHOT, [makeView(camAtPc(MID_BAND_PC), t)], STATE, ALL_ON).awake;

      counters.inFlight = 1;
      plan(0);
      expect(plan(10 * NODE_FADE_MS)).toBe(true);
      counters.inFlight = 0;
      expect(plan(11 * NODE_FADE_MS)).toBe(false);
    });

    it('plans on a first cut, then only every STAR_PLAN_INTERVAL_FRAMES while a chunk is in flight or the eye moves, and once at rest', () => {
      const { stream, counters } = stubStream();
      const planner = starCatalogPlanner(makeRuntime(true, stream));
      const frame = (t: number) =>
        planner.plan(SNAPSHOT, [makeView(camAtPc(MID_BAND_PC), t)], STATE, ALL_ON);
      const walks = vi.mocked(planStarChunks);
      walks.mockClear();

      frame(0);
      expect(walks).toHaveBeenCalledTimes(1);
      for (let i = 1; i < 10; i++) frame(i);
      expect(walks).toHaveBeenCalledTimes(1); // unchanged camera, nothing in flight

      counters.inFlight = 1;
      frame(10); // the interval since the first walk has long passed
      expect(walks).toHaveBeenCalledTimes(2);
      for (let i = 11; i < 10 + STAR_PLAN_INTERVAL_FRAMES; i++) frame(i);
      expect(walks).toHaveBeenCalledTimes(2);
      frame(10 + STAR_PLAN_INTERVAL_FRAMES);
      expect(walks).toHaveBeenCalledTimes(3);
      expect(stream.update).toHaveBeenCalledTimes(3);

      counters.inFlight = 0;
      frame(100);
      walks.mockClear();
      const at = (xPc: number, t: number) =>
        planner.plan(SNAPSHOT, [makeView(camAtPc(xPc), t)], STATE, ALL_ON);
      for (let i = 0; i < 2 * STAR_PLAN_INTERVAL_FRAMES; i++) at(MID_BAND_PC + 10 * i, 101 + i);
      expect(walks).toHaveBeenCalledTimes(2); // moving: on the first move, then one interval on
      const restPc = MID_BAND_PC + 10 * (2 * STAR_PLAN_INTERVAL_FRAMES - 1);
      for (let i = 0; i < STAR_PLAN_INTERVAL_FRAMES; i++) at(restPc, 200 + i);
      expect(walks).toHaveBeenCalledTimes(3); // stopped past the last plan's pose: one plan at rest
    });

    it('re-arms the fade window when a chunk lands', () => {
      const { stream, counters } = stubStream();
      const planner = starCatalogPlanner(makeRuntime(true, stream));
      const plan = (t: number) =>
        planner.plan(SNAPSHOT, [makeView(camAtPc(MID_BAND_PC), t)], STATE, ALL_ON).awake;

      plan(0);
      expect(plan(1000)).toBe(false);
      counters.epoch = 1;
      expect(plan(2000)).toBe(true);
      expect(plan(2000 + NODE_FADE_MS - 1)).toBe(true);
      expect(plan(2000 + NODE_FADE_MS)).toBe(false);
    });
  });

  describe('drift tolerance', () => {
    const FRAME_MS = 8;
    const SLACK_PC = EYE_SLACK_MPC * SCALE_UNITS.MPC_TO_PC;

    function pruningView(xPc: number, yawRad: number, nowMs: number): FrameView {
      const vp = mat4d.multiply(
        mat4d.perspective(1, 1, 0.1, 100),
        mat4d.rotationY(yawRad),
      ) as Float64Array;
      return { ...makeView(camAtPc(xPc), nowMs), slabs: [{ vp }] } as unknown as FrameView;
    }

    /** Votes for frames 8 ms apart; `pose(i)` gives each frame's eye (pc) and yaw (rad). */
    function votes(frames: number, pose: (i: number) => { xPc: number; yaw: number }): boolean[] {
      const planner = starCatalogPlanner(makeRuntime(true));
      return Array.from({ length: frames }, (_, i) => {
        const { xPc, yaw } = pose(i);
        return planner.plan(SNAPSHOT, [pruningView(xPc, yaw, i * FRAME_MS)], STATE, ALL_ON).awake;
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
  });

  it('re-installs the pools when the chunk-slots override changes, publishing the outcome', () => {
    const runtime = makeRuntime(true);
    const octree = {} as StarOctree;
    const upload = vi.fn((_s: number, _o: StarOctree, slots: number) => {
      if (slots > 256) throw new Error('only 256 slots fit');
      return 0;
    });
    const publish = vi.fn();
    Object.assign(runtime, {
      publish,
      poolHost: {
        renderer: runtime.renderer,
        chunkStreams: runtime.chunkStreams,
        requestRender: () => {},
      },
      catalogs: new Map([
        [
          Source.GaiaStars,
          {
            current: () => octree,
            lastRequest: () => ({ tier: 'medium' }),
            committed: () => ({ req: { source: Source.GaiaStars, tier: 'medium' } }),
          },
        ],
      ]),
    });
    Object.assign(runtime.renderer, { upload });
    const planner = starCatalogPlanner(runtime);
    const plan = (chunkSlotsOverride: number | null) =>
      planner.plan(
        SNAPSHOT,
        [makeView(camAtPc(MID_BAND_PC), 0)],
        {
          settings: { starCatalogs: { ...STATE.settings.starCatalogs, chunkSlotsOverride } },
        } as unknown as PassState,
        ALL_ON,
      );

    plan(null);
    expect(publish).not.toHaveBeenCalled();
    plan(512);
    expect(publish).toHaveBeenLastCalledWith({ chunkSlotsError: 'only 256 slots fit' });
    plan(512);
    expect(publish).toHaveBeenCalledTimes(1);
    plan(128);
    expect(publish).toHaveBeenLastCalledWith({ chunkSlotsError: null });
  });
});
