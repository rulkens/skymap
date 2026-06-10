/**
 * pickRenderer.diskPick.test — type-level and stub-device contract for the
 * procedural-disk pick integration.
 *
 * Two concerns:
 *
 * 1. Signature shape — `proceduralDiskRenderer` must be the 8th positional
 *    (index 7) and optional. Pins append-not-reorder: if a future edit
 *    moves it before `structureMarkerRenderer` (index 6) or makes it
 *    required, the type assertion below fails at type-check time.
 *
 * 2. `pickDisks` behaviour — after a `draw` with N instances, `pickDisks`
 *    issues `pass.draw(6, N)`; on a fresh renderer (no prior draw) it is a
 *    no-op (no setPipeline / draw).
 */

import { describe, it, expect, vi } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import { createProceduralDiskRenderer } from '../../../../src/services/gpu/renderers/proceduralDiskRenderer';
import type { ProceduralDiskInstance } from '../../../../src/@types/rendering/ProceduralDiskInstance';

// ── 1. Signature pin ────────────────────────────────────────────────────────

describe('createPickRenderer disk-pick integration', () => {
  it('keeps proceduralDiskRenderer optional as the 8th positional (index 7)', () => {
    // Compile-time: the 8th parameter must exist and be assignable from
    // `undefined` (declared with `?`). Removing it, making it required,
    // or reordering it before structureMarkerRenderer all break this.
    type Sig = Parameters<typeof createPickRenderer>;
    const _check = (...args: Sig): void => {
      const eighth: Sig[7] = args[7];
      const _undef: typeof eighth = undefined;
      void _undef;
    };
    expect(_check).toBeTypeOf('function');
  });
});

// ── 2. pickDisks behaviour ──────────────────────────────────────────────────

function makePickStubInit() {
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
    createPipelineLayout: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    createSampler: vi.fn(() => ({})),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;

  return {
    init: {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      focusBgl: {} as unknown as import('../../../../src/@types/rendering/FocusUniformsBgl').FocusUniformsBgl,
    },
  };
}

function makeStubPass() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

const FOCUS_BG = {} as unknown as GPUBindGroup;

function fakeInstance(overrides: Partial<ProceduralDiskInstance> = {}): ProceduralDiskInstance {
  return {
    x: 1, y: 2, z: 3,
    sizeWorldMpc: 0.05,
    axisRatio: 0.6,
    positionAngleDeg: 45,
    colourIndex: 0.7,
    crossfadeAlpha: 0.5,
    procFadeOut: 1,
    sourceCode: 0,
    localIdx: 0,
    ...overrides,
  };
}

describe('proceduralDiskRenderer.pickDisks', () => {
  it('issues draw(6, N) after draw() with N instances', () => {
    const { init } = makePickStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const visPass = makeStubPass();
    const instances: ProceduralDiskInstance[] = [
      fakeInstance({ sourceCode: 1, localIdx: 42 }),
      fakeInstance({ sourceCode: 2, localIdx: 99 }),
      fakeInstance({ sourceCode: 3, localIdx: 7 }),
    ];
    renderer.draw(visPass, new Float32Array(16), [800, 600], [0, 0, 0], 100, FOCUS_BG, instances);

    const pickPass = makeStubPass();
    renderer.pickDisks(pickPass);

    // Must have set the pick pipeline.
    expect(pickPass.setPipeline).toHaveBeenCalledTimes(1);
    // Must have drawn 6 vertices × 3 instances.
    expect(pickPass.draw).toHaveBeenCalledWith(6, 3);
  });

  it('is a no-op on a fresh renderer with no prior draw', () => {
    const { init } = makePickStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const pickPass = makeStubPass();
    renderer.pickDisks(pickPass);

    // Nothing should have been called — lastPickInstanceCount is 0.
    expect(pickPass.setPipeline).not.toHaveBeenCalled();
    expect(pickPass.draw).not.toHaveBeenCalled();
  });

  it('is a no-op after draw() is called with an empty instances array', () => {
    // Regression: draw() with 0 instances must zero lastPickInstanceCount
    // (a stale prior-frame count would make pickDisks() re-draw the
    // previous frame's disks into the pick texture).
    const { init } = makePickStubInit();
    const renderer = createProceduralDiskRenderer(init);

    // First draw: 3 instances. pickDisks confirms something was drawn.
    const visPass1 = makeStubPass();
    const instances: ProceduralDiskInstance[] = [
      fakeInstance({ sourceCode: 1, localIdx: 10 }),
      fakeInstance({ sourceCode: 1, localIdx: 11 }),
      fakeInstance({ sourceCode: 1, localIdx: 12 }),
    ];
    renderer.draw(visPass1, new Float32Array(16), [800, 600], [0, 0, 0], 100, FOCUS_BG, instances);
    const pickPass1 = makeStubPass();
    renderer.pickDisks(pickPass1);
    expect(pickPass1.draw).toHaveBeenCalledWith(6, 3); // sanity

    // Second draw: empty. pickDisks on a fresh pass must be a no-op.
    const visPass2 = makeStubPass();
    renderer.draw(visPass2, new Float32Array(16), [800, 600], [0, 0, 0], 100, FOCUS_BG, []);
    const pickPass2 = makeStubPass();
    renderer.pickDisks(pickPass2);
    expect(pickPass2.setPipeline).not.toHaveBeenCalled();
    expect(pickPass2.draw).not.toHaveBeenCalled();
  });
});
