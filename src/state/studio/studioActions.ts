/**
 * studioActions — `openStudio(id)` opens a registry clip in the clip studio as a takeover
 * (`watchTakeoverSaga`); `exitTakeover` closes it. Reducer-less, like `startClip`: the studio's
 * own state lives in the lazily injected slice inside `packages/studio`.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ClipId } from '../../@types/animation/ClipId';

export const openStudio = createAction<ClipId>('studio/open');
