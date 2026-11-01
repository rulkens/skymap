/**
 * A craft is picked through `Source.Craft` over an index into missions' own craft order, and
 * deep-linked through `body-<id>`, a prefix it shares with the `body` kind. Both halves only
 * work while pack and unpack read the same table (the claims' disjointness is
 * `tests/compositions/bodyFocusClaims.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../../../src/layers/body/present/bodySelectionRow';
import { craftSelectionRow } from '../../../../src/layers/missions/present/craftSelectionRow';
import { craftPickId } from '../../../../src/layers/missions/present/craftPickId';
import { MISSION_CRAFT_IDS } from '../../../../src/layers/missions/present/missionCraftIds';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { ALL_KINDS_ENABLED } from '../../../support/allKindsEnabled';

const resolver = composeSelectionRows(
  () => [bodySelectionRow(), craftSelectionRow()],
  () => ALL_KINDS_ENABLED,
);

describe('craftSelectionRow', () => {
  it('round-trips pick, ref and focus id for every craft', () => {
    expect(MISSION_CRAFT_IDS.size).toBeGreaterThan(1);
    for (const id of MISSION_CRAFT_IDS) {
      const ref = { type: 'craft', id } as const;
      expect(resolver.resolvePick(unpackPick(craftPickId(id)!))).toEqual(ref);
      expect(resolver.resolveFocusId(resolver.focusIdOf(ref)!)).toEqual(ref);
    }
  });
});
