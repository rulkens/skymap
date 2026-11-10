/** Opens a registry clip in the studio as a takeover; reducer-less, like `startClip`, since the
 * studio's own state lives in the slice `packages/studio` injects. */
import { createAction } from '@reduxjs/toolkit';

import type { ClipId } from '../../@types/animation/ClipId';

export const openStudio = createAction<ClipId>('studio/open');
