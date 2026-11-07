/**
 * clockTo — a tour beat moves the sim clock to `simDays` (Julian days) over `overSec` real
 * seconds along `ease` (a camera-tween curve; linear when omitted); 0 snaps. The type stays
 * off the `time/` route: the time slice drops a running profile on any `time/*` action,
 * which would include this one's own.
 */
import { createAction } from '@reduxjs/toolkit';

import type { Ease } from '../../@types/animation/Ease';

export const clockTo = createAction<{ simDays: number; overSec: number; ease?: Ease }>(
  'tour/clockTo',
);
