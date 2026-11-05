/** The one root write for every visibility switch. The `settings/` prefix is what wakes
 * `watchFadesSaga`'s reactive sync. */

import { createAction } from '@reduxjs/toolkit';

import type { SetVisibilityPayload } from '../../@types/settings/SetVisibilityPayload';

export const setVisibility = createAction<SetVisibilityPayload>('settings/setVisibility');
