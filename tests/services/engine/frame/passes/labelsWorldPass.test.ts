/**
 * labelsWorldPass — enable gate and draw arguments. The ZoA lettering relies on
 * it drawing the full-res slab view, so a regression here silently drops the
 * band's caption.
 */

import { describe, it, expect, vi } from 'vitest';

import { labelsWorldPass } from '../../../../../src/services/engine/frame/passes/labelsWorldPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const PASS_STUB = {} as GPURenderPassEncoder;
const VIEW_STUB = { vp: new Float32Array(16), viewportPx: [1280, 720] } as unknown as SlabView;
const CTX_STUB = { drawPxPerRad: 42 } as unknown as FrameView;

function makeState(renderer: unknown): EngineState {
  return { gpu: { label3DRenderer: renderer } } as unknown as EngineState;
}

describe('labelsWorldPass', () => {
  it('is off while the renderer is not built', () => {
    expect(labelsWorldPass.enabled(makeState(null), CTX_STUB, VIEW_STUB)).toBe(false);
  });

  it('is off when no glyphs were fed this frame', () => {
    const state = makeState({ glyphCount: () => 0 });
    expect(labelsWorldPass.enabled(state, CTX_STUB, VIEW_STUB)).toBe(false);
  });

  it('is on with glyphs, and draws with the slab vp, viewport and pixel scale', () => {
    const draw = vi.fn();
    const state = makeState({ glyphCount: () => 3, draw });
    expect(labelsWorldPass.enabled(state, CTX_STUB, VIEW_STUB)).toBe(true);
    labelsWorldPass.draw(PASS_STUB, VIEW_STUB, CTX_STUB, state);
    expect(draw).toHaveBeenCalledWith(PASS_STUB, VIEW_STUB.vp, VIEW_STUB.viewportPx, 42);
  });
});
