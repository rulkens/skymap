/**
 * runBloom — the regression guard for the strict-order bloom sub-pipeline.
 *
 * The old ten-`ContentPass` wiring blew the whole screen white: the executor
 * re-fired each reused-target upsample layer at its target's DOWNSAMPLE step,
 * reading a level before this frame's clear, so it pulled in last frame's
 * contents and ramped brightness every frame. These tests pin the fix by
 * asserting the exact pass sequence — every source is a level written EARLIER in
 * the sequence, so nothing reads a stale or uncleared level. A mock pyramid
 * records the ordered method calls (with the source-view id each received) and a
 * mock encoder records each `beginRenderPass` descriptor, so the whole routine
 * runs without a WebGPU device.
 */

import { describe, it, expect, vi } from 'vitest';

import { runBloom } from '../../../../src/services/engine/frame/runBloom';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { BloomPyramid } from '../../../../src/@types/rendering/BloomPyramid';
import type { FilmSettings } from '../../../../src/@types/settings/FilmSettings';
import { DEFAULT_FILM } from '../../../../src/data/film/filmDefaults';
import { DEFAULT_BLOOM_CAP } from '../../../../src/data/defaults';

// ── Mock pyramid ─────────────────────────────────────────────────────────────
//
// Records the ordered method calls plus the source-view id each draw received —
// the id lets a test prove downsample(L) read bloom[L-1] and upsample(L) read
// bloom[L+1], which is exactly what the stale-read bug got wrong.

type PyramidCall = {
  method: string;
  level?: number;
  srcId: string;
  karis?: boolean;
  kind?: string;
  iteration?: number;
  axis?: string;
};

function makePyramid() {
  const calls: PyramidCall[] = [];
  const idOf = (view: GPUTextureView) => (view as unknown as { id: string }).id;
  const pyramid = {
    label: 'mock-bloom',
    bright: vi.fn((_pass: GPURenderPassEncoder, srcView: GPUTextureView) => {
      calls.push({ method: 'bright', srcId: idOf(srcView) });
    }),
    downsample: vi.fn(
      (
        _pass: GPURenderPassEncoder,
        srcView: GPUTextureView,
        level: number,
        _texel: unknown,
        karis: boolean,
      ) => {
        calls.push({ method: 'downsample', level, srcId: idOf(srcView), karis });
      },
    ),
    upsample: vi.fn((_pass: GPURenderPassEncoder, srcView: GPUTextureView, level: number) => {
      calls.push({ method: 'upsample', level, srcId: idOf(srcView) });
    }),
    fold: vi.fn((_pass: GPURenderPassEncoder, srcView: GPUTextureView, kind: string) => {
      calls.push({ method: 'fold', srcId: idOf(srcView), kind });
    }),
    streak: vi.fn((_pass: GPURenderPassEncoder, srcView: GPUTextureView, iteration: number) => {
      calls.push({ method: 'streak', srcId: idOf(srcView), iteration });
    }),
    veil: vi.fn((_pass: GPURenderPassEncoder, srcView: GPUTextureView, axis: string) => {
      calls.push({ method: 'veil', srcId: idOf(srcView), axis });
    }),
    destroy: vi.fn(),
  } as unknown as BloomPyramid;
  return { pyramid, calls };
}

// ── Mock encoder ─────────────────────────────────────────────────────────────

function makeEncoder() {
  const passDescs: GPURenderPassDescriptor[] = [];
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    passDescs.push(desc);
    return { end: vi.fn() } as unknown as GPURenderPassEncoder;
  });
  return {
    encoder: { beginRenderPass } as unknown as GPUCommandEncoder,
    passDescs,
    beginRenderPass,
  };
}

// ── Mock ctx / state / timing ────────────────────────────────────────────────

// hdr clears a=1 (opaque black); every bloom mip clears a=0, matching
// production — the pyramid accumulates additively, so an untouched texel
// must contribute nothing (see `renderTargets.ts`'s `renderTargetRows`).
const BLOOM_SPECS = [
  {
    id: 'hdr',
    format: 'rgba16float' as const,
    depth: null,
    scale: 1,
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
  },
  ...[2, 4, 8, 16, 32].map((scale, n) => ({
    id: `bloom${n}`,
    format: 'rgba16float' as const,
    depth: null,
    scale,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
  })),
  ...[
    ['streak0', 8],
    ['streak1', 8],
    ['veil0', 32],
    ['veil1', 32],
  ].map(([id, scale]) => ({
    id: id as string,
    format: 'rgba16float' as const,
    depth: null,
    scale: scale as number,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
  })),
];

function makeCtx(): FrameView {
  // A view whose `id` echoes the target — the pyramid recorder reads it back to
  // prove which level each draw sampled.
  const viewOf = (id: string) => ({ id }) as unknown as GPUTextureView;
  return {
    snapshot: {
      renderTargets: {
        viewOf,
        specs: BLOOM_SPECS,
        specOf: (id: string) => {
          const spec = BLOOM_SPECS.find((s) => s.id === id);
          if (!spec) throw new Error(`mock renderTargets: no spec row for '${id}'`);
          return spec;
        },
        // `bloomSrcTexelSize` reads the ALLOCATED size of the source level, so
        // every pass in the sequence throws without this — the fixture mirrors
        // production's `floor(canvas / scale)` over the table declared above.
        sizeOf: (id: string) => {
          const spec = BLOOM_SPECS.find((s) => s.id === id);
          if (!spec) throw new Error(`mock renderTargets: no size for '${id}'`);
          return {
            width: Math.max(1, Math.floor(1920 / spec.scale)),
            height: Math.max(1, Math.floor(1080 / spec.scale)),
          };
        },
      },
    },
    canvasSize: { width: 1920, height: 1080 },
  } as unknown as FrameView;
}

const FILM_ON: FilmSettings = {
  ...DEFAULT_FILM,
  enabled: true,
  grade: { ...DEFAULT_FILM.grade, squeeze: 1.5 },
  glow: { ...DEFAULT_FILM.glow, cap: 12, streakStrength: 1, veil: 0.3 },
};

// bloom0 is 1920/2 px wide in the mock ctx: the level-1 downsample's unsqueezed texel x.
const BLOOM0_TEXEL_X = 1 / 960;

/** What `bright` and the level-1 downsample received: the cap and the squeeze land here. */
function brightAndDownsampleArgs(pyramid: BloomPyramid) {
  const params = vi.mocked(pyramid.bright).mock.calls[0]![2];
  const texel = vi.mocked(pyramid.downsample).mock.calls[0]![3];
  return { params, texel };
}

function makeState(pyramid: BloomPyramid | null, film: FilmSettings = DEFAULT_FILM): EngineState {
  return {
    gpu: { bloomPyramid: pyramid },
    settings: { bloom: { enabled: true, threshold: 0.8, strength: 1.5 }, film },
  } as unknown as EngineState;
}

const BLOOM_TIMING = {
  enabled: true,
  descriptorFor: vi.fn(() => ({
    querySet: { _stub: 'bloom' } as unknown as GPUQuerySet,
    beginningOfPassWriteIndex: 10,
    endOfPassWriteIndex: 11,
  })),
} as unknown as GpuTimingService;

const NO_TIMING = {
  enabled: false,
  descriptorFor: () => undefined,
} as unknown as GpuTimingService;

/** Read one pass descriptor's single colour attachment. */
function attachmentOf(desc: GPURenderPassDescriptor): {
  view: { id: string };
  loadOp: string;
} {
  return Array.from(desc.colorAttachments as Iterable<unknown>)[0] as {
    view: { id: string };
    loadOp: string;
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runBloom', () => {
  it('with the look off the pass sequence is exactly bright → down(1..4) → up(3..0) → fold', () => {
    // The single assertion that would have caught the stale-read bug: every
    // downsample(L) reads bloom[L-1] and every upsample(L) reads bloom[L+1] —
    // a level the sequence wrote BEFORE this pass. The old wiring re-fired the
    // upsample at the downsample step, reading last frame's contents.
    const { pyramid, calls } = makePyramid();
    const { encoder } = makeEncoder();
    runBloom(encoder, makeCtx(), makeState(pyramid), NO_TIMING);

    expect(calls).toEqual([
      { method: 'bright', srcId: 'hdr' },
      { method: 'downsample', level: 1, srcId: 'bloom0', karis: true },
      { method: 'downsample', level: 2, srcId: 'bloom1', karis: false },
      { method: 'downsample', level: 3, srcId: 'bloom2', karis: false },
      { method: 'downsample', level: 4, srcId: 'bloom3', karis: false },
      { method: 'upsample', level: 3, srcId: 'bloom4' },
      { method: 'upsample', level: 2, srcId: 'bloom3' },
      { method: 'upsample', level: 1, srcId: 'bloom2' },
      { method: 'upsample', level: 0, srcId: 'bloom1' },
      { method: 'fold', srcId: 'bloom0', kind: 'bloom' },
    ]);
    // The film glow's cap and squeeze must not leak while the look is off.
    const { params, texel } = brightAndDownsampleArgs(pyramid);
    expect(params.cap).toBe(DEFAULT_BLOOM_CAP);
    expect(params.capFloor).toBe(DEFAULT_BLOOM_CAP);
    expect(texel[0]).toBeCloseTo(BLOOM0_TEXEL_X);
  });

  it('with the look on, streak reads bloom1 after the downsample chain, veil reads bloom4, both folds precede the bloom fold, and the end timestamp rides the last pass', () => {
    const { pyramid, calls } = makePyramid();
    const { encoder, passDescs } = makeEncoder();
    runBloom(encoder, makeCtx(), makeState(pyramid, FILM_ON), BLOOM_TIMING);

    expect(
      calls.map((c) => [c.method, c.srcId, c.kind ?? c.iteration ?? c.axis ?? c.level]),
    ).toEqual([
      ['bright', 'hdr', undefined],
      ['downsample', 'bloom0', 1],
      ['downsample', 'bloom1', 2],
      ['downsample', 'bloom2', 3],
      ['downsample', 'bloom3', 4],
      ['streak', 'bloom1', 0],
      ['streak', 'streak0', 1],
      ['streak', 'streak1', 2],
      ['upsample', 'bloom4', 3],
      ['upsample', 'bloom3', 2],
      ['upsample', 'bloom2', 1],
      ['upsample', 'bloom1', 0],
      ['veil', 'bloom4', 'x'],
      ['veil', 'veil0', 'y'],
      ['fold', 'veil1', 'veil'],
      ['fold', 'streak0', 'streak'],
      ['fold', 'bloom0', 'bloom'],
    ]);
    // Each pass writes the target the next one reads: streak0 → streak1 → streak0, veil0 → veil1.
    expect(passDescs.slice(5, 8).map((d) => attachmentOf(d).view.id)).toEqual([
      'streak0',
      'streak1',
      'streak0',
    ]);
    expect(passDescs.slice(12, 14).map((d) => attachmentOf(d).view.id)).toEqual(['veil0', 'veil1']);
    type Tw = { timestampWrites?: GPURenderPassTimestampWrites };
    expect((passDescs.at(-1) as Tw).timestampWrites?.endOfPassWriteIndex).toBe(11);
    for (const desc of passDescs.slice(1, -1)) expect((desc as Tw).timestampWrites).toBeUndefined();
    const { params, texel } = brightAndDownsampleArgs(pyramid);
    expect(params.cap).toBe(12);
    expect(params.capFloor).toBe(DEFAULT_BLOOM_CAP);
    expect(texel[0]).toBeCloseTo(BLOOM0_TEXEL_X * 1.5);
  });

  it('with the look on and streakStrength 0, no streak pass is encoded', () => {
    // The render-target rows release streak0/1 on the same predicate, so an
    // encoded streak pass here would throw on viewOf in production.
    const { pyramid, calls } = makePyramid();
    const { encoder } = makeEncoder();
    const film = { ...FILM_ON, glow: { ...FILM_ON.glow, streakStrength: 0 } };
    runBloom(encoder, makeCtx(), makeState(pyramid, film), NO_TIMING);

    expect(calls.some((c) => c.srcId.startsWith('streak') || c.method === 'streak')).toBe(false);
  });

  it('opens each pass against the level it writes, clearing producers and loading folds', () => {
    // The bright + four downsample passes CLEAR their target (each is its sole
    // producer this sequence); the four additive upsample folds and the fold
    // into hdr LOAD (they accumulate onto a level written earlier this sequence).
    const { pyramid } = makePyramid();
    const { encoder, passDescs } = makeEncoder();
    runBloom(encoder, makeCtx(), makeState(pyramid), NO_TIMING);

    expect(passDescs.map((d) => attachmentOf(d).view.id)).toEqual([
      'bloom0',
      'bloom1',
      'bloom2',
      'bloom3',
      'bloom4',
      'bloom3',
      'bloom2',
      'bloom1',
      'bloom0',
      'hdr',
    ]);
    expect(passDescs.map((d) => attachmentOf(d).loadOp)).toEqual([
      'clear',
      'clear',
      'clear',
      'clear',
      'clear',
      'load',
      'load',
      'load',
      'load',
      'load',
    ]);
  });

  it('brackets the sequence with one bloom timing span: begin on the first pass, end on the last', () => {
    // The single `'bloom'` slot spans the whole sub-routine — the bright pass
    // carries only the begin index, the fold pass only the end index, both
    // sharing the one query pair. `descriptorFor('bloom')` is consulted once.
    const descriptorFor = vi.fn(() => ({
      querySet: { _stub: 'bloom' } as unknown as GPUQuerySet,
      beginningOfPassWriteIndex: 10,
      endOfPassWriteIndex: 11,
    }));
    const timing = { enabled: true, descriptorFor } as unknown as GpuTimingService;
    const { pyramid } = makePyramid();
    const { encoder, passDescs } = makeEncoder();
    runBloom(encoder, makeCtx(), makeState(pyramid), timing);

    expect(descriptorFor).toHaveBeenCalledTimes(1);
    expect(descriptorFor).toHaveBeenCalledWith('bloom');

    type Tw = { timestampWrites?: GPURenderPassTimestampWrites };
    const firstTw = (passDescs[0] as Tw).timestampWrites;
    const lastTw = (passDescs[passDescs.length - 1] as Tw).timestampWrites;
    expect(firstTw?.beginningOfPassWriteIndex).toBe(10);
    expect(firstTw?.endOfPassWriteIndex).toBeUndefined();
    expect(lastTw?.endOfPassWriteIndex).toBe(11);
    expect(lastTw?.beginningOfPassWriteIndex).toBeUndefined();
    // Same query pair on both ends of the span.
    expect((firstTw?.querySet as unknown as { _stub: string })._stub).toBe('bloom');
    expect((lastTw?.querySet as unknown as { _stub: string })._stub).toBe('bloom');
    // No middle pass carries a timestamp — only the two span ends do.
    for (const desc of passDescs.slice(1, -1)) {
      expect((desc as Tw).timestampWrites).toBeUndefined();
    }
  });
});
