/**
 * The Galactic Centre caption is often the hole's whole on-screen presence and its click target,
 * so a pick the Layer's own selection row does not resolve fails silently.
 */

import { describe, expect, it } from 'vitest';

import { blackHoleLabelSource } from '../../../../../src/layers/blackHoles/markers/present/blackHoleLabelSource';
import { blackHoleSelectionRow } from '../../../../../src/layers/blackHoles/selection/blackHoleSelectionRow';
import { SGR_A_STAR_ENTRY } from '../../../../../src/layers/blackHoles/sources/sgrAStar';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { packPickWord } from '../../../../../src/utils/labels/packPickWord';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { PositionedId } from '../../../../../src/@types/scene/PositionedId';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { blackHolePickCode } from '../../../../support/layerPickCodes';

describe('blackHoleLabelSource', () => {
  it('black holes describe their labels', () => {
    const source = blackHoleLabelSource({ pickCode: blackHolePickCode() });
    const items = source.items({} as EngineState);
    const i = items.findIndex((row) => row.id === SGR_A_STAR_ENTRY.id);
    const d = source.describe(items[i]!, i)!;

    expect(d.text).toBe(SGR_A_STAR_ENTRY.label);
    expect(d.fadeKey).toBe(SGR_A_STAR_ENTRY.id);
    // The anchor is a body core tracks, so the caption follows the hole's place.
    const anchorId = (d.position as { anchorId: PositionedId }).anchorId;
    expect(deriveBodyStates(CONST_J2000).get(anchorId)).toBeDefined();
    expect(packPickWord(d.pick!.code, d.pick!.index)).toBe(
      blackHoleSelectionRow(blackHolePickCode()).encodePick({
        type: 'blackHole',
        id: SGR_A_STAR_ENTRY.id,
      }),
    );
  });
});
