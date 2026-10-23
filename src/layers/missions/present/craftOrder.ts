import { MISSION_CRAFT_IDS } from './missionCraftIds';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

/** The craft ids in pick-index order: `craftPickId` packs an index into it, `craftSelectionRow` reads it back. */
export const CRAFT_ORDER: readonly SceneBodyId[] = [...MISSION_CRAFT_IDS];
