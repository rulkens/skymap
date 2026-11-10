/** Adds the studio slice to the app's root reducer (ADR 0016). Idempotent: RTK skips a slice already injected. */
import { studioSlice } from './studioSlice';
import { rootReducer } from '../../../../../src/store/rootReducer';

export function injectStudioSlice(): void {
  rootReducer.inject(studioSlice);
}
