/**
 * A craft is picked through `Source.Craft` over an index into missions' own craft order, and
 * deep-linked through `body-<id>`, a prefix it shares with the `body` kind. Both halves only
 * work while pack and unpack read the same table and the two kinds' claims stay disjoint.
 */

import { describe, expect, it } from 'vitest';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { coreSelectionRows } from '../../../../src/services/engine/selection/coreSelectionRows';
import { craftSelectionRow } from '../../../../src/layers/missions/present/craftSelectionRow';
import { craftPickId } from '../../../../src/layers/missions/present/craftPickId';
import { MISSION_CRAFT_IDS } from '../../../../src/layers/missions/present/missionCraftIds';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { isCoreBodyId } from '../../../../src/utils/scene/isCoreBodyId';
import { ALL_KINDS_ENABLED } from '../../../support/allKindsEnabled';

const resolver = composeSelectionRows(
  () => [...coreSelectionRows(), craftSelectionRow()],
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

  it('body-<id> is claimed by exactly one kind for every scene body', () => {
    for (const { id } of SCENE_BODIES) {
      const ref = resolver.resolveFocusId(`body-${id}`);
      if (MISSION_CRAFT_IDS.has(id)) expect(ref).toEqual({ type: 'craft', id });
      else if (isCoreBodyId(id)) expect(ref).toEqual({ type: 'body', id });
      else expect(ref).toBeNull();
    }
  });
});
