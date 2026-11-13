import type { RootState } from '../../store/types';
import type { SkyBelowHorizon } from '../../@types/sky/SkyBelowHorizon';
import { skyRoute } from '../../store/constants';

export const selectSkyBelowHorizon = (state: RootState): SkyBelowHorizon | null =>
  state[skyRoute].belowHorizon;
