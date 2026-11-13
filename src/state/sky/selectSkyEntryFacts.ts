import { skyRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';

export const selectSkyEntryFacts = (state: RootState): SkyEntryFacts => state[skyRoute].entry;
