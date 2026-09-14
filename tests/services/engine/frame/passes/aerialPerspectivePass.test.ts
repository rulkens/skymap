/**
 * aerialPerspectivePass — the inside-the-shell half of the atmosphere, and its
 * complementarity with `atmosphereShellPass`. Both collaborators are mocked:
 * the draw list's cull maths is `atmosphereDrawList.test.ts`'s and the uniform
 * record `atmosphereShellPass.test.ts`'s, so what is left is this pass's own
 * wiring — the gate and the depth view it binds.
 */

import { describe, it, expect, vi } from 'vitest';

import type { AtmosphereDrawEntry } from '../../../../../src/@types/engine/frame/AtmosphereDrawEntry';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const UNIFORMS = new Float32Array(44);
vi.mock('../../../../../src/services/engine/frame/atmosphereDrawList', () => ({
  atmosphereDrawList: vi.fn<() => readonly AtmosphereDrawEntry[]>(() => []),
}));
vi.mock('../../../../../src/services/engine/frame/atmosphereShellUniforms', () => ({
  atmosphereShellUniforms: vi.fn<() => Float32Array>(() => UNIFORMS),
}));
import { atmosphereDrawList } from '../../../../../src/services/engine/frame/atmosphereDrawList';
import { aerialPerspectivePass } from '../../../../../src/services/engine/frame/passes/aerialPerspectivePass';
import { atmosphereShellPass } from '../../../../../src/services/engine/frame/passes/atmosphereShellPass';
import { makeSlab } from '../../../../fixtures/makeSlab';

const drawListMock = vi.mocked(atmosphereDrawList);

const PASS_STUB = {} as GPURenderPassEncoder;
const VIEW: SlabView = {
  slab: makeSlab({ index: 2, frame: { kind: 'body-m', bodyId: 'earth' as BodyId } }),
  vp: new Float32Array(16),
  camPos: [0, 0, 5],
  viewportPx: [1280, 720],
};

function entry(inside: boolean): AtmosphereDrawEntry {
  return { body: { id: 'earth' }, inside } as unknown as AtmosphereDrawEntry;
}

describe('aerialPerspectivePass', () => {
  it('is the exact complement of atmosphereShellPass on one body row', () => {
    // Both drawing the same body in one frame doubles the in-scatter; neither
    // drawing leaves the limb blank. The two gates read the same `inside` flag,
    // so this is the only place the pair can be pinned as a pair.
    const state = { gpu: { atmosphereShellRenderer: {} } } as unknown as EngineState;
    const ctx = {} as ReadyFrameContext;

    for (const inside of [true, false]) {
      drawListMock.mockReturnValue([entry(inside)]);
      expect(aerialPerspectivePass.enabled(state, ctx, VIEW)).toBe(inside);
      expect(atmosphereShellPass.enabled(state, ctx, VIEW)).toBe(!inside);
    }
  });

  it('binds foreground:0’s DEPTH view, not its colour', () => {
    // Both resolve to a `GPUTextureView`, so the compiler cannot tell them
    // apart; handing over the colour view fogs the frame by its own brightness.
    const depthView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const state = {
      gpu: { atmosphereShellRenderer: { drawAerialPerspective: drawSpy } },
    } as unknown as EngineState;
    const ctx = {
      renderTargets: { depthViewOf: vi.fn(() => depthView), viewOf: vi.fn() },
    } as unknown as ReadyFrameContext;
    drawListMock.mockReturnValue([entry(true)]);

    aerialPerspectivePass.draw(PASS_STUB, VIEW, ctx, state);

    expect(drawSpy).toHaveBeenCalledWith(PASS_STUB, 'earth', UNIFORMS, depthView);
    expect(ctx.renderTargets.depthViewOf).toHaveBeenCalledWith('foreground:0');
  });
});
