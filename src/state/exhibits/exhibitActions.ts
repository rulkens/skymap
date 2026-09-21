/**
 * exhibitActions — `openExhibit(id)`, the reducer-less signal
 * `watchTakeoverSaga` picks up to start an exhibit's takeover; `exitTakeover`
 * ends it, shared with tours.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ExhibitId } from '../../@types/exhibits/ExhibitId';

export const openExhibit = createAction<ExhibitId>('exhibit/open');
