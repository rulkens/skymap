import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { draftResolved, studioOpened } from '../../src/session/state/studioSlice';
import { selectDraft, selectRevision } from '../../src/session/state/selectors';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { PreviewPins } from '../../src/@types/session/PreviewPins';

const PREVIEW: PreviewPins = {
  startPose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  simDays: 2451545,
  frame: 'equatorial',
  fovYRad: 0.8,
};

/** A real app store with the studio slice open on `draft`; `resolve` lands the draft itself as its resolution (no focus ids). */
export function openStudioStore(draft: ClipData, options: { resolve?: boolean } = {}) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(studioOpened({ clipId: 'cosmicFlows', draft, preview: PREVIEW }));
  if (options.resolve ?? true) {
    store.dispatch(
      draftResolved({
        revision: selectRevision(store.getState()),
        data: selectDraft(store.getState())!,
      }),
    );
  }
  return store;
}
