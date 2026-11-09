import { describe, expect, it } from 'vitest';

import { selectionKindShown } from '../../../../src/services/engine/presentation/selectionKindShown';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';

// One show entry, full out to 1 Mpc and gone by 2.
const ENTRIES: readonly VisibilityEntry[] = [
  { key: 'stellarStreams', selects: ['stellarStream'], bands: { near: { out: [1, 2] } } },
];

function stateWith(fade: number) {
  return {
    subsystems: { fades: { opacityOf: () => fade }, clipPlayer: { clipOpacityOf: () => 1 } },
    visibilityEntries: ENTRIES,
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
}

// A fresh view per call: `resolveViewFadeValue` memoises on view identity.
const viewAt = (distanceMpc: number) =>
  ({
    drawCamPos: [distanceMpc, 0, 0],
    snapshot: { nowMs: 0, bodyStates: new Map() },
  }) as unknown as FrameView;

const IN_BAND_MPC = 0.5;
const OUT_OF_BAND_MPC = 4;

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
