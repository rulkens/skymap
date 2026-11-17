/** View-cover selectors — the read seam for the `viewCover` slice. */

import { createSelector } from '@reduxjs/toolkit';

import { viewCoverRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { InsetsPx } from '../../@types/layout/InsetsPx';

// Max, not sum: every reach is measured from the canvas edge, so panels
// stacked on one edge already include each other.
export const selectViewCoverPx = createSelector(
  [(state: RootState) => state[viewCoverRoute]],
  (covers): InsetsPx => {
    const insets = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const cover of Object.values(covers)) {
      insets[cover.edge] = Math.max(insets[cover.edge], cover.reachPx);
    }
    return insets;
  },
);
