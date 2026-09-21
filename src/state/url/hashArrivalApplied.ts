/**
 * hashArrivalApplied — reducer-less signal that the boot hash read applied a
 * non-empty URL. `watchHashWriteSaga` takes it once to canonicalize that
 * arrival's first settled publish with `replaceState` instead of pushing.
 */
import { createAction } from '@reduxjs/toolkit';

export const hashArrivalApplied = createAction('url/hashArrivalApplied');
