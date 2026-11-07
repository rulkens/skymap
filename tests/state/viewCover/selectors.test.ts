import { describe, expect, it } from 'vitest';

import { rootReducer } from '../../../src/store/rootReducer';
import { selectViewCoverPx } from '../../../src/state/viewCover/selectors';
import { viewCoverSet } from '../../../src/state/viewCover/viewCoverSlice';
import type { RootState } from '../../../src/store/types';

const boot = (): RootState => rootReducer(undefined, { type: '@@init' });
const span = [0, 400] as const;

describe('selectViewCoverPx', () => {
  it('takes the max per edge', () => {
    let state = boot();
    state = rootReducer(
      state,
      viewCoverSet({ id: 'phoneBottom', cover: { edge: 'bottom', reachPx: 140, spanPx: span } }),
    );
    state = rootReducer(
      state,
      viewCoverSet({ id: 'exhibitCaption', cover: { edge: 'bottom', reachPx: 300, spanPx: span } }),
    );
    expect(selectViewCoverPx(state)).toEqual({ top: 0, right: 0, bottom: 300, left: 0 });
  });

  it('leaves the desktop HUD out of the lens shift', () => {
    const desktop = [
      ['leftStack', 'left'],
      ['infoCard', 'right'],
      ['timeBar', 'bottom'],
      ['scaleBar', 'bottom'],
      ['topBar', 'top'],
    ] as const;
    const state = desktop.reduce(
      (s, [id, edge]) =>
        rootReducer(s, viewCoverSet({ id, cover: { edge, reachPx: 200, spanPx: span } })),
      boot(),
    );
    expect(selectViewCoverPx(state)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
