import { describe, it, expect, vi } from 'vitest';
import { clipPathDebugPass } from '../../../../../src/services/engine/frame/passes/clipPathDebugPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { ClipPathSnapshot } from '../../../../../src/@types/engine/debug/ClipPathSnapshot';
import type { Mat4 } from 'wgpu-matrix';

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as Mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    nowMs: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderer: {} as never,
    postProcess: {} as never,
    volumeOffscreen: {} as never,
    texturedDisks: {} as never,
  };
}

function makeRendererSpy() {
  return {
    label: 'debugLineRenderer',
    setLines: vi.fn(),
    draw: vi.fn(),
    lineCount: vi.fn(),
    destroy: vi.fn(),
  };
}

const SNAPSHOT: ClipPathSnapshot = {
  clipId: 'demo' as ClipPathSnapshot['clipId'],
  durationSec: 10,
  samples: [
    { t: 0, eye: [0, 0, 0], target: [1, 0, 0], distance: 5, speed01: 0 },
    { t: 10, eye: [10, 0, 0], target: [11, 0, 0], distance: 5, speed01: 1 },
  ],
};

function makeState(opts: {
  renderer: ReturnType<typeof makeRendererSpy> | null;
  snapshot: ClipPathSnapshot | null;
  scrub01?: number;
}): EngineState {
  return {
    gpu: { debugLineRenderer: opts.renderer },
    subsystems: { clipPathInspector: { current: () => opts.snapshot } },
    settings: { debug: { clipPathInspect: { clipId: 'demo', scrub01: opts.scrub01 ?? 0 } } },
  } as unknown as EngineState;
}

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;
const DEPS_STUB = {} as PassDeps;

describe('clipPathDebugPass.enabled', () => {
  it('is false when the renderer is null', () => {
    const state = makeState({ renderer: null, snapshot: SNAPSHOT });
    expect(clipPathDebugPass.enabled(state, makeCtx())).toBe(false);
  });

  it('is false when there is no snapshot', () => {
    const state = makeState({ renderer: makeRendererSpy(), snapshot: null });
    expect(clipPathDebugPass.enabled(state, makeCtx())).toBe(false);
  });

  it('is true when renderer + snapshot both present', () => {
    const state = makeState({ renderer: makeRendererSpy(), snapshot: SNAPSHOT });
    expect(clipPathDebugPass.enabled(state, makeCtx())).toBe(true);
  });
});

describe('clipPathDebugPass.draw', () => {
  it('builds lines from the snapshot and forwards to setLines + draw', () => {
    const renderer = makeRendererSpy();
    const state = makeState({ renderer, snapshot: SNAPSHOT, scrub01: 0 });
    clipPathDebugPass.draw(PASS_STUB, makeCtx(), state, DEPS_STUB);

    expect(renderer.setLines).toHaveBeenCalledOnce();
    const lines = renderer.setLines.mock.calls[0]![0]!;
    // 1 route segment + 1 target segment (2 samples → 1 pair each) + 9 gizmo lines
    expect(lines.length).toBe(11);

    expect(renderer.draw).toHaveBeenCalledOnce();
    // viewport is draw's 3rd arg
    expect(renderer.draw.mock.calls[0]![2]).toEqual([1280, 720]);
  });
});
