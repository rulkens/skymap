import { describe, expect, it } from 'vitest';

import { rootReducer } from '../../../src/store/rootReducer';
import { selectViewCoverPx } from '../../../src/state/viewCover/selectors';
import { viewCoverSet } from '../../../src/state/viewCover/viewCoverSlice';
import type { RootState } from '../../../src/store/types';

const boot = (): RootState => rootReducer(undefined, { type: '@@init' });

describe('selectViewCoverPx', () => {
  it('takes the max per edge', () => {
    let state = boot();
    state = rootReducer(
      state,
      viewCoverSet({ id: 'phoneBottom', cover: { edge: 'bottom', reachPx: 140 } }),
    );
    state = rootReducer(
      state,
      viewCoverSet({ id: 'exhibitCaption', cover: { edge: 'bottom', reachPx: 300 } }),
    );
    expect(selectViewCoverPx(state)).toEqual({ top: 0, right: 0, bottom: 300, left: 0 });
  });

  it('is zero with no covers', () => {
    expect(selectViewCoverPx(boot())).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
