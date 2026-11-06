/**
 * produceBlackHoleCaptions — the Galactic Centre caption is often the hole's
 * whole on-screen presence and its click target, so a pick id the Layer's own
 * selection row does not resolve fails silently: hover and click find nothing.
 * (Its caption's gates are pinned in `sources/sgrAStar.test.ts`.)
 */

import { ZERO_FOCUS } from '../../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, it, expect, vi } from 'vitest';

import { produceBlackHoleCaptions } from '../../../../../src/layers/blackHoles/markers/present/produceBlackHoleCaptions';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { blackHoleSelectionRow } from '../../../../../src/layers/blackHoles/selection/blackHoleSelectionRow';
import { SGR_A_STAR_ENTRY } from '../../../../../src/layers/blackHoles/sources/sgrAStar';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import { blackHolePickCode } from '../../../../support/layerPickCodes';

// Occlusion is the shared compose's concern, covered beside core's captions.
vi.mock('../../../../../src/services/engine/frame/sceneOccluderBodies', () => ({
  sceneOccluderBodies: () => [],
}));

const STATE = {} as unknown as EngineState;

const CTX = {
  snapshot: {
    bodyStates: deriveBodyStates(CONST_J2000),
    simDays: CONST_J2000,
    nowMs: 0,
    focusBlend: 0,
    focus: ZERO_FOCUS,
  },
  cam: { distance: 1e-3 },
  drawCamPos: [0, 0, 0],
  drawPxPerRad: 720,
  canvasSize: { width: 1280, height: 720 },
} as unknown as FrameView;

describe('produceBlackHoleCaptions', () => {
  const [caption] = produceBlackHoleCaptions(blackHolePickCode())(STATE, CTX, {
    [SGR_A_STAR_ENTRY.id]: 1,
  }).labels;

  it('packs a pick id the Layer’s selection row resolves to the hole', () => {
    const pick = unpackPick(caption!.pickId!)!;
    expect(blackHoleSelectionRow(blackHolePickCode()).resolvePick(pick)).toEqual({
      type: 'blackHole',
      id: SGR_A_STAR_ENTRY.id,
    });
  });
});
