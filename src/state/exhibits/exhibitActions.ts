/**
 * exhibitActions — `openExhibit({ id, entry })`, the reducer-less signal
 * `watchTakeoverSaga` picks up to start an exhibit's takeover; `exitTakeover`
 * ends it, shared with tours. `entry: 'cut'` lands on the exhibit's pose with
 * no fly (a deep link's arrival); the palette flies. `atLinkedTime` marks a link whose `t=` set
 * the clock, which a timeline exhibit then keeps instead of opening at the craft's launch.
 * `fromLink` is set only by `navigateSaga`: a link's exhibit date is the exhibit's own, so exit
 * returns the clock to the live now rather than to the arrival instant.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ExhibitId } from '../../@types/exhibits/ExhibitId';
import type { Transition } from '../../@types/navigation/Transition';

export const openExhibit = createAction<{
  id: ExhibitId;
  entry: Transition;
  atLinkedTime?: boolean;
  fromLink?: boolean;
}>('exhibit/open');
