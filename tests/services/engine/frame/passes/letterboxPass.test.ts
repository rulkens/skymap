import { describe, it, expect, vi } from 'vitest';
import { letterboxPass } from '../../../../../src/services/engine/frame/passes/letterboxPass';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const ctx = { canvasSize: { width: 1600, height: 900 } } as unknown as FrameView;
const view = {} as SlabView;

function stateWith(renderer: { draw: ReturnType<typeof vi.fn> } | null, enabled = true) {
  return {
    gpu: { letterboxRenderer: renderer },
    settings: {
      film: { ...INITIAL_SETTINGS.film, enabled, letterbox: true, letterboxAspect: 1.85 },
    },
  } as unknown as EngineState;
}

describe('letterboxPass', () => {
  it('stays off without its renderer or with the look off', () => {
    expect(letterboxPass.enabled(stateWith(null), ctx, view)).toBe(false);
    expect(letterboxPass.enabled(stateWith({ draw: vi.fn() }, false), ctx, view)).toBe(false);
    expect(letterboxPass.enabled(stateWith({ draw: vi.fn() }), ctx, view)).toBe(true);
  });

  it("hands the renderer this view's target size and the film's ratio", () => {
    const renderer = { draw: vi.fn() };
    const pass = {} as GPURenderPassEncoder;
    letterboxPass.draw(pass, view, ctx, stateWith(renderer));
    expect(renderer.draw).toHaveBeenCalledWith(pass, { width: 1600, height: 900 }, 1.85);
  });
});
