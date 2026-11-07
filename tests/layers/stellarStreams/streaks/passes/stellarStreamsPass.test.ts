import { describe, expect, it, vi } from 'vitest';

import { stellarStreamsPass } from '../../../../../src/layers/stellarStreams/streaks/passes/stellarStreamsPass';
import { initialState } from '../../../../../src/layers/stellarStreams/state/stellarStreams/initialState';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../../src/data/selectionEncoding';
import type { StellarStreamsRuntime } from '../../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const PICK_CODE = 9;
const STATE = { settings: { stellarStreams: initialState } } as unknown as PassState;
const VIEW = {
  slab: { vp: new Float64Array(16) },
  camPos: [0, 0, 0],
  viewportPx: [8, 8],
} as unknown as SlabView;
const ctxOf = (focusPickId: number | null) =>
  ({ drawPxPerRad: 1000, snapshot: { focusPickId, focusBlend: 1 } }) as unknown as FrameView;

function pickedStream(focusPickId: number | null): number {
  const ribbonPick = { draw: vi.fn() };
  const runtime = { ribbonPick, pickCode: PICK_CODE } as unknown as StellarStreamsRuntime;
  stellarStreamsPass(runtime).drawPick!(
    {} as GPURenderPassEncoder,
    VIEW,
    ctxOf(focusPickId),
    STATE,
    1,
  );
  return ribbonPick.draw.mock.calls[0]![5];
}

describe('stellarStreamsPass picking', () => {
  it('stamps every ribbon at rest, and only the focused stream’s under its focus', () => {
    expect(pickedStream(null)).toBe(-1);
    expect(pickedStream(packSelection(PICK_CODE, 4 + PICK_SENTINEL_OFFSET))).toBe(4);
  });
});
