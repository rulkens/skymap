import { SGR_A_STAR_ENTRY } from '../../sources/sgrAStar';
import type { BlackHolesSettings } from '../../../../@types/settings/BlackHolesSettings';

export const initialState: BlackHolesSettings = {
  items: {
    [SGR_A_STAR_ENTRY.id]: { labelEnabled: true },
  },
};
