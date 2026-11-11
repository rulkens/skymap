import type { SelectionRowBase } from '../../engine/selection/SelectionRowBase';

/**
 * The focus row for a clip's last applied focus step, as `watchSelectionRowsSaga` would extract
 * it. A value the player extracts once per focus crossing and hands to `sceneView`, which must not
 * call the resolver itself: the resolver may read the engine's getters, and those read the view.
 */
export type FocusRow = { readonly row: SelectionRowBase | null; readonly focusId: string | null };
