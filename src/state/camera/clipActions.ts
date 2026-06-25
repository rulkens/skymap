/**
 * clipActions — the request signals that drive single-clip playback from the UI.
 *
 * `playClip` asks the engine to play one Layer-1 clip; `watchClipSaga` runs
 * the clip-player seam (live-pose resolution + completion Promise) in response.
 * `stopClip` aborts the active clip.
 *
 * Both are reducer-less: clip *state* lives in the camera slice — `startClip` /
 * `endClip` write `camera.clip` — and these are the higher-level intents the saga
 * translates into that lifecycle. Keeping them as request actions (not direct
 * `startClip`/`endClip` dispatches) means the UI never has to resolve the live
 * camera pose or drive the player teardown itself; the saga owns that. The dev
 * panel reads `selectClipActive` for its readout rather than awaiting a Promise.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ClipData } from '../../@types/animation/ClipData';

export const playClip = createAction('clip/play', (clip: ClipData) => ({ payload: clip }));
export const stopClip = createAction('clip/stop');
