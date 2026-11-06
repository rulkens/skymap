import { describe, expect, it } from 'vitest';
import { earthSceneSelectionRow } from '../../../../../src/layers/earthScenes/scenes/present/earthSceneSelectionRow';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { relErr } from '../../../../support/relErr';
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';

describe('earthSceneSelectionRow', () => {
  it('places Søndermarken at its footprint radius, in Mpc', () => {
    const scene = earthSceneSelectionRow().extractRow(
      { type: 'earthScene', id: asSceneBodyId('soendermarken') },
      CONST_J2000,
    ) as PlacedRow;
    expect(relErr(scene.radiusMpc, 5.268590196210728e-21)).toBeLessThan(1e-12);
  });
});
