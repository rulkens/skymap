/** Whether the displayed pair still lags the view, and the box it does show.
 *  At wide spans `original` lands in milliseconds while `adjusted` still has
 *  a sun fit to run, so the pair is only caught up once BOTH match the view;
 *  until then the preview transform anchors on the image still behind. */
import { createSelector } from '@reduxjs/toolkit';
import type { BenchState } from '../../@types/BenchState';
import { boxEquals } from '../utils/boxEquals';
import { selectBox } from './selectBox';

export const selectRenderLag = createSelector(
  [
    selectBox,
    (state: BenchState) => state.render.originalBox,
    (state: BenchState) => state.render.adjustedBox,
  ],
  (box, originalBox, adjustedBox) => {
    const pending =
      originalBox === undefined ||
      adjustedBox === undefined ||
      !boxEquals(originalBox, box) ||
      !boxEquals(adjustedBox, box);
    return { pending, renderedBox: pending ? (adjustedBox ?? originalBox) : box };
  },
);
