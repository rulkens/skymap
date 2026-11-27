/** The span the ruler tints while Loop is on: the running loop, or paused, what Play would loop. */
import { createSelector } from '@reduxjs/toolkit';

import { selectLoop, selectTransport } from '../../session/state/selectors';
import { loopSpanOf } from '../../session/utils/loopSpanOf';
import { selectSelectedRow } from './selectSelectedRow';
import { selectTimeline } from './selectTimeline';
import type { ClipSpan } from '../../../../../src/@types/animation/ClipSpan';

export const selectShownLoop = createSelector(
  [selectLoop, selectTransport, selectSelectedRow, selectTimeline],
  (loop, transport, row, timeline): ClipSpan | null => {
    if (!loop || timeline === null) return null;
    return transport.kind === 'running' ? transport.loop : loopSpanOf(row, timeline);
  },
);
