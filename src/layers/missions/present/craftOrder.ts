import { MISSION_CRAFT_IDS } from './missionCraftIds';

/** The craft ids in pick-index order: `craftPickId` packs an index into it, `craftSelectionRow` reads it back. */
export const CRAFT_ORDER: readonly string[] = [...MISSION_CRAFT_IDS];
