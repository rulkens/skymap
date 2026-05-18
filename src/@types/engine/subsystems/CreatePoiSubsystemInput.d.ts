import type { EngineCallbacks } from '../EngineCallbacks';

/**
 * Construction-time hooks for `createPoiSubsystem`.
 *
 * Currently a single optional field — the EngineCallbacks bag — so the
 * subsystem can fan out `setHoveredPoi` changes to
 * `cb.selection.onPoiHoverChange` from the same equality short-circuit
 * site that does the dedupe.  Mirrors the selectionSubsystem pattern:
 * subsystems own their own change-detection AND their own callback
 * fires, so callers never have to remember to call both.
 *
 * Why optional rather than required: tests that don't care about the
 * callback fan-out (the pre-plan-5 suite, plus the produceMarkers /
 * setSelectedPoi cases) shouldn't have to construct a stub callback
 * bag.  The runtime engine always passes `cb`; tests opt in only when
 * they're asserting the fan-out itself.
 *
 * Why an object wrapper around the single field (rather than a bare
 * `cb?: EngineCallbacks` positional arg): forward-compatibility with
 * additional construction hooks (e.g. a live-cloud accessor closure if
 * a future feature needs one), matching the
 * `CreateSelectionSubsystemInput` shape.
 */
export type CreatePoiSubsystemInput = {
  /**
   * UI-callback sink — only `selection.onPoiHoverChange` is read from
   * within this subsystem today.  The rest of the bag is carried for
   * type-shape symmetry with sibling subsystem factories; future POI-
   * adjacent callbacks (e.g. category-visibility echoes) could land
   * here.
   */
  cb?: EngineCallbacks;
};
