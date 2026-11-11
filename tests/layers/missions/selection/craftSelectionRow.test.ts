/**
 * A craft is picked through the allocator's craft code over an index into missions' own craft order, and
 * deep-linked through `body-<id>`, a prefix it shares with the `body` kind. Both halves only
 * work while pack and unpack read the same table (the claims' disjointness is
 * `tests/compositions/bodyFocusClaims.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../../../src/layers/body/selection/bodySelectionRow';
import { craftSelectionRow } from '../../../../src/layers/missions/selection/craftSelectionRow';
import { craftPickId } from '../../../../src/layers/missions/craft/present/craftPickId';
import { MISSION_CRAFT_IDS } from '../../../../src/layers/missions/craft/present/missionCraftIds';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { NO_KINDS_OFF } from '../../../support/noKindsOff';
import { bodyPickCodes, missionsPickCode } from '../../../support/layerPickCodes';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { relErr } from '../../../support/relErr';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { PlacedRow } from '../../../../src/@types/engine/selection/PlacedRow';

// Codes from 40 up: a craft row that still packs the catalog value fails the round trip.
const missions = missionsPickCode();
const resolver = composeSelectionRows(
  () => [bodySelectionRow({ pickCodes: bodyPickCodes() }), craftSelectionRow(missions)],
  () => NO_KINDS_OFF,
);

describe('craftSelectionRow', () => {
  it('round-trips pick, ref and focus id for every craft', () => {
    expect(MISSION_CRAFT_IDS.size).toBeGreaterThan(1);
    for (const id of MISSION_CRAFT_IDS) {
      const ref = { type: 'craft', id } as const;
      expect(resolver.resolvePick(unpackPick(craftPickId(id, missions)!))).toEqual(ref);
      expect(resolver.resolveFocusId(resolver.focusIdOf(ref)!)).toEqual(ref);
    }
  });

  it('places Voyager 1 at its footprint radius, in Mpc', () => {
    const voyager = craftSelectionRow(missions).extractRow(
      { type: 'craft', id: asSceneBodyId('voyager1') },
      CONST_J2000,
    ) as PlacedRow;
    expect(relErr(voyager.radiusMpc, 4.713666063029354e-22)).toBeLessThan(1e-12);
  });
});
