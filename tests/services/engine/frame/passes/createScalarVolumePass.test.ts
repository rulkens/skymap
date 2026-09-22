/**
 * createScalarVolumePass tests — the shared factory behind a scalar-volume
 * raymarch ContentPass. `name` is forwarded verbatim from the row (trivial,
 * untested here); these tests cover the two things the factory computes
 * itself: the downscaled-viewport draw call and the liveness gate.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { createScalarVolumePass } from '../../../../../src/services/engine/frame/passes/createScalarVolumePass';
import type { ScalarVolumePassRow } from '../../../../../src/@types/engine/frame/ScalarVolumePassRow';
import type { VolumeFieldRenderer } from '../../../../../src/@types/rendering/VolumeFieldRenderer';
import type { VolumeFieldLiveness } from '../../../../../src/@types/rendering/VolumeFieldLiveness';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

type FieldId = 'mcpm';

/** Minimal FrameView whose 'test-target' sizeOf resolves to the fixture size. */
function makeCtx(): FrameView {
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      renderTargets: {
        sizeOf: vi.fn(() => ({ width: 100, height: 50 })),
      },
    },
    canvasSize: { width: 300, height: 150 },
    drawPxPerRad: 600,
  } as unknown as FrameView;
}

const VIEW_STUB = {
  vp: new Float32Array(16) as unknown as Mat4,
  camPos: [0, 0, 5],
} as unknown as SlabView;

const STATE_STUB = {} as EngineState;
const PASS_STUB = {} as GPURenderPassEncoder;

function makeRenderer(
  drawSpy: ReturnType<typeof vi.fn<VolumeFieldRenderer<FieldId>['draw']>>,
): VolumeFieldRenderer<FieldId> {
  return {
    label: 'stub',
    upload: () => {},
    unload: () => {},
    hasActiveFields: () => true,
    listIds: () => ['mcpm'],
    draw: drawSpy,
    destroy: () => {},
  };
}

function makeRow(
  overrides: Partial<ScalarVolumePassRow<FieldId>> = {},
): ScalarVolumePassRow<FieldId> {
  return {
    name: 'test-volume',
    targetId: 'test-target',
    renderer: makeRenderer(vi.fn()),
    liveness: () => null,
    ...overrides,
  };
}

const LIVENESS_STUB: VolumeFieldLiveness<FieldId> = {
  settingsOf: () => undefined,
  fadeOpacityOf: () => 1,
};

describe('createScalarVolumePass', () => {
  it('draws with sizeOf(row.targetId) as the viewport and pxPerRad scaled by the target height', () => {
    const drawSpy = vi.fn<VolumeFieldRenderer<FieldId>['draw']>();
    const renderer = makeRenderer(drawSpy);
    const pass = createScalarVolumePass(makeRow({ renderer, liveness: () => LIVENESS_STUB }));

    pass.draw(PASS_STUB, VIEW_STUB, makeCtx(), STATE_STUB);

    expect(drawSpy).toHaveBeenCalledTimes(1);
    const call = drawSpy.mock.calls[0]!;
    expect(call[2]).toEqual([100, 50]); // viewportPx
    expect(call[3]).toBe(200); // 600 * (50 / 150)
  });

  it('is disabled when liveness returns null', () => {
    const pass = createScalarVolumePass(makeRow({ liveness: () => null }));
    expect(pass.enabled(STATE_STUB, makeCtx(), VIEW_STUB)).toBe(false);
  });

  it('is enabled when liveness is non-null, and skips the draw call otherwise', () => {
    const drawSpy = vi.fn<VolumeFieldRenderer<FieldId>['draw']>();
    const renderer = makeRenderer(drawSpy);
    const pass = createScalarVolumePass(makeRow({ renderer, liveness: () => LIVENESS_STUB }));
    expect(pass.enabled(STATE_STUB, makeCtx(), VIEW_STUB)).toBe(true);

    const nullRow = makeRow({ renderer, liveness: () => null });
    const nullPass = createScalarVolumePass(nullRow);
    nullPass.draw(PASS_STUB, VIEW_STUB, makeCtx(), STATE_STUB);
    expect(drawSpy).not.toHaveBeenCalled();
  });
});
