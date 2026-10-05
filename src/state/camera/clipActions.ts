/**
 * clipActions — reducer-less requests that name a clip; the sagas resolve it
 * and run the player, so the UI never touches the registry or the player.
 * `startClip(id)` starts a registry clip as a takeover (`watchTakeoverSaga`);
 * `exitTakeover` ends it. `replayInspectedPath` replays the clip-path
 * inspector's start-pinned route, a debug play outside the takeover system.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ClipId } from '../../@types/animation/ClipId';

export const startClip = createAction('clip/start', (id: ClipId) => ({ payload: id }));
export const replayInspectedPath = createAction('clip/replayInspected');
