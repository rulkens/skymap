/**
 * clipActions — the request signals that drive single-clip playback from the UI.
 *
 * `startClip(id)` asks the engine to play one registered Layer-1 clip by its
 * `ClipId`; `watchClipSaga` looks the id up in `clipRegistry`, runs the
 * clip-player seam (live-pose resolution + completion Promise), and tears it
 * down. `stopClip` aborts the active clip.
 *
 * Both are reducer-less: clip *state* lives in the camera slice — `clipStarted` /
 * `clipEnded` write `camera.clip` — and these are the higher-level intents the
 * saga translates into that lifecycle. Keeping them as request actions (the saga
 * resolves the id and the live camera pose, not the UI) means the dev panel only
 * names a clip; it never touches the registry or the player. The panel reads
 * `selectClipActive` for its readout rather than awaiting a Promise.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ClipId } from '../../@types/animation/ClipId';

export const startClip = createAction('clip/start', (id: ClipId) => ({ payload: id }));
export const stopClip = createAction('clip/stop');
