/**
 * Every scene body deep-links as `body-<id>`, a prefix three kinds share: `body`, missions'
 * `craft` and earthScenes' `earthScene`. Each claims only its own ids; a body nobody claims opens
 * nothing, and two claimants make every resolve throw. Only the seeded stars stay unclaimed here
 * (they deep-link as `star-<id>`).
 */

import { describe, expect, it } from 'vitest';
import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { bodyLayer } from '../../src/layers/body/layer';
import { missionsLayer } from '../../src/layers/missions/layer';
import { earthScenesLayer } from '../../src/layers/earthScenes/layer';
import { MISSION_CRAFT_IDS } from '../../src/layers/missions/present/missionCraftIds';
import { EARTH_SCENE_BODY_IDS } from '../../src/data/bodies/earthSceneBodyIds';
import { SCENE_BODIES } from '../../src/data/bodies/sceneBodies';
import { SCENE_SUN } from '../../src/data/bodies/sceneSun';
import { SCENE_STARS } from '../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../src/data/bodies/sceneSStars';
import { isBodyKindId } from '../../src/layers/body/present/isBodyKindId';
import { ALL_KINDS_ENABLED } from '../support/allKindsEnabled';

const STAR_IDS = new Set<string>([...SCENE_SUN, ...SCENE_STARS, ...SCENE_S_STARS].map((s) => s.id));

const resolver = composeSelectionRows(
  () => [
    ...bodyLayer.selection!(undefined as never),
    ...missionsLayer.selection!(undefined as never),
    ...earthScenesLayer.selection!(undefined as never),
  ],
  () => ALL_KINDS_ENABLED,
);

describe('body-<id> focus claims', () => {
  it("every scene body's focus id is claimed by the kind that owns it", () => {
    expect(EARTH_SCENE_BODY_IDS.size).toBeGreaterThan(0);
    for (const { id } of SCENE_BODIES) {
      const ref = resolver.resolveFocusId(`body-${id}`);
      const kind = MISSION_CRAFT_IDS.has(id)
        ? 'craft'
        : EARTH_SCENE_BODY_IDS.has(id)
          ? 'earthScene'
          : isBodyKindId(id)
            ? 'body'
            : null;
      if (kind === null) {
        expect(STAR_IDS.has(id), `${id} is owned by no kind`).toBe(true);
        expect(ref).toBeNull();
        continue;
      }
      expect(ref).toEqual({ type: kind, id });
      expect(resolver.focusIdOf(ref!)).toBe(`body-${id}`);
    }
  });
});
