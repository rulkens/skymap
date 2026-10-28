import selectionReducer from '../../src/state/selection/selectionSlice';
import type { SelectionState } from '../../src/@types/store/SelectionState';

/** The selection slice's initial state: nothing hovered, selected, focused or pending. */
export const NO_SELECTION: SelectionState = selectionReducer(undefined, { type: 'test/init' });
