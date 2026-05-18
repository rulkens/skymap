/**
 * EngineDebugState — opt-in per-frame skip flags driven by the
 * DebugPanel's renderer-toggle section.
 *
 * Lives under `state.debug` so the encoder helpers
 * (`encodeHdrSingle`, `encodeHdrSplit`, `encodeUiOverlay`) can short-
 * circuit any pass whose name appears in `disabledPasses` without
 * threading a separate dep through every call.  The set is normally
 * empty — the production frame path pays one `Set.has` per pass per
 * frame, which is in the noise next to the GPU dispatch.
 *
 * ### Why a `Set<string>` rather than a per-pass boolean bag
 *
 * Pass names are kebab-case strings carried on the `Pass` interface
 * already (`pointSpritesPass.name === 'point-sprites'`).  A
 * `Set<string>` lets us iterate `HDR_PASSES`/`UI_PASSES` in the
 * DebugPanel UI without enumerating each name in a struct shape — the
 * set is the open-world half, the pass arrays are the closed-world
 * half, and the only invariant the consumer cares about is "is this
 * particular name disabled right now".
 *
 * ### Why mutable in place
 *
 * Matches the rest of `EngineState`: each toggle from the React panel
 * is a single `add` or `delete`, and the next frame's encoder reads
 * the live set.  An immutable replacement would force the handle to
 * re-bind the whole state field on every flip — pointless allocation
 * for a hot debug toggle.
 */

export type EngineDebugState = {
  /**
   * Pass names the user has manually disabled.  An encoder helper
   * MUST consult this set after `pass.enabled(...)` returns true and
   * skip the draw block when the name is present.  The override is
   * one-way: it can only hide passes that would otherwise have run,
   * not force-enable a pass whose own gate returned false.
   */
  readonly disabledPasses: Set<string>;
};
