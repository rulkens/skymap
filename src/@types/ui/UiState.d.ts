/**
 * UiState — the shape of the Redux 'ui' slice.
 *
 * `splash` is a nested object rather than its own root slice because it has
 * exactly two fields that are unambiguously UI concerns and are never read
 * independently of each other. Splitting them into a sibling root slice would
 * be over-segmentation: the store combiner gains a level of nesting but no
 * decomplection — the same reducer would own both fields either way.
 *
 * Tour caption / beat-progress state is NOT here — it lives in the dedicated
 * `tour` runtime slice (the overlay derives the caption from `tourId` +
 * `beatIndex`), keeping this slice to app-level chrome.
 */

export type UiState = {
  paletteOpen: boolean;
  uiHidden: boolean;
  debugPanelOpen: boolean;
  splash: {
    visible: boolean;
    dismissedVersion: number | null;
  };
};
