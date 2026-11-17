import { describe, expect, it } from 'vitest';

import { selectionKindShown } from '../../../../src/services/engine/presentation/selectionKindShown';
import { stellarStreamsVisibility } from '../../../../src/layers/stellarStreams/visibility';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function stateWith(fade: number) {
  return {
    subsystems: { fades: { opacityOf: () => fade }, clipPlayer: { clipOpacityOf: () => 1 } },
    visibilityEntries: stellarStreamsVisibility,
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
}

// A fresh view per call: `resolveViewFadeValue` memoises on view identity.
const viewAt = (distanceMpc: number) =>
  ({
    drawCamPos: [distanceMpc, 0, 0],
    snapshot: { nowMs: 0, bodyStates: new Map() },
  }) as unknown as FrameView;

const IN_BAND_MPC = 20 * SCALE_UNITS.KPC_TO_MPC;
const OUT_OF_BAND_MPC = 2 * FOREGROUND_MAX_DISTANCE_MPC;

describe('selectionKindShown', () => {
  it("is the selecting entry's fade × band at the view", () => {
    expect(selectionKindShown(stateWith(1), viewAt(IN_BAND_MPC), 'stellarStream')).toBe(1);
    expect(selectionKindShown(stateWith(0), viewAt(IN_BAND_MPC), 'stellarStream')).toBe(0);
    expect(selectionKindShown(stateWith(1), viewAt(OUT_OF_BAND_MPC), 'stellarStream')).toBe(0);
  });

  it('is 1 for a kind no show entry selects', () => {
    expect(selectionKindShown(stateWith(0), viewAt(OUT_OF_BAND_MPC), 'structure')).toBe(1);
  });
});
