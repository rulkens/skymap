/**
 * produceBlackHoleCaptions — the Galactic Centre caption is often the hole's
 * whole on-screen presence and its click target, so a pick id the Layer's own
 * selection row does not resolve fails silently: hover and click find nothing.
 * (Its caption kind's gates are pinned in `sources/sgrAStar.test.ts`.)
 */

import { describe, it, expect, vi } from 'vitest';

import { produceBlackHoleCaptions } from '../../../../src/layers/blackHoles/present/produceBlackHoleCaptions';
import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/present/blackHoleSelectionRow';
import { SGR_A_STAR_ENTRY } from '../../../../src/layers/blackHoles/sources/sgrAStar';
import { SOURCE_REGISTRY } from '../../../../src/data/sources';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';

// Occlusion is the shared compose's concern, covered beside core's captions.
vi.mock('../../../../src/services/engine/frame/sceneOccluderBodies', () => ({
  sceneOccluderBodies: () => [],
}));

const STATE = {
  settings: { blackHoles: { items: { [SGR_A_STAR_ENTRY.id]: { labelEnabled: true } } } },
  subsystems: {
    fades: { opacityOf: () => 1 },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
} as unknown as EngineState;

const CTX = {
  snapshot: { simDays: CONST_J2000, nowMs: 0 },
  cam: { distance: 1e-3 },
  drawCamPos: [0, 0, 0],
  drawPxPerRad: 720,
  canvasSize: { width: 1280, height: 720 },
} as unknown as FrameView;

describe('produceBlackHoleCaptions', () => {
  const [caption] = produceBlackHoleCaptions()(STATE, CTX).labels;

  it('names the place, not the designation', () => {
    expect(caption!.text).toBe(SGR_A_STAR_ENTRY.label);
  });

  it('packs a pick id the Layer’s selection row resolves to the hole', () => {
    const pick = unpackPick(caption!.pickId!)!;
    const entry = SOURCE_REGISTRY[pick.sourceCode as keyof typeof SOURCE_REGISTRY];
    expect(blackHoleSelectionRow().resolvePick(entry, pick)).toEqual({
      type: 'blackHole',
      id: SGR_A_STAR_ENTRY.id,
    });
  });
});
