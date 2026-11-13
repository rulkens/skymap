import { skyRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { SkyView } from '../../@types/engine/SkyView';

/** Non-null exactly while the viewer stands (D9): the HUD, search and the entry gate all read it. */
export const selectSkyView = (state: RootState): SkyView => state[skyRoute].view;
