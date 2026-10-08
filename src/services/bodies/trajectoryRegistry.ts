/**
 * trajectoryRegistry — loaded spacecraft tracks, as plain module state.
 *
 * `deriveBodyStates` is a pure function of the clock that memoizes on
 * `simDays`; a track arriving while the clock is paused must still invalidate
 * that memo, so every `set` bumps `version()` and the memo keys on both.
 */

import type { SampledTrack } from '../../@types/scene/SampledTrack';

const tracks = new Map<string, SampledTrack>();
let version = 0;

export const trajectoryRegistry = {
  get: (id: string): SampledTrack | undefined => tracks.get(id),
  set: (track: SampledTrack): void => {
    tracks.set(track.id, track);
    version += 1;
  },
  version: (): number => version,
};
