/**
 * RequestKey — one-shot request-flag union for the asset-demand layer.
 *
 * ### Why one-shot flags need a separate axis
 *
 * Most asset-demand predicates are driven by persistent state: the user
 * enables filaments (settings toggle), a galaxy catalog is enabled (settings items
 * bit), or a companion asset is ready (slot state).  Those are level-
 * triggered — the predicate stays true as long as the condition holds.
 *
 * A handful of assets should load exactly once in response to a transient
 * user action, not because a persistent toggle is on.  Opening the palette
 * picker is the clearest example: the user taps a swatch, we want to fetch
 * the full palette manifest eagerly, but there is no "palette panel is open"
 * boolean in settings — the panel is a short-lived popover.  Storing the
 * flag in settings would mean the palette fetch re-triggers on every session
 * load (leaks into persistence) or requires an explicit clear on panel close
 * (adds teardown coupling).
 *
 * `RequestKey` names those transient edge-trigger conditions.  The
 * wiring layer sets a `RequestKey` flag in response to a discrete
 * UI trigger (`paletteOpened`) — and the demand predicate reads it via
 * `DemandCtx.request(k)`.  The flag is never cleared: once set it stays set,
 * and the demand loop's idle-guard keeps the already-loaded slot from
 * re-fetching, so a second trigger is a no-op.  No persistent settings
 * mutation, no teardown coupling.
 *
 * ### Members
 *
 *   - `'paletteOpened'` — a user opened the scalar-volume palette picker.
 *     Triggers an eager prefetch of the full palette manifest so the
 *     palette thumbnails are available before the popover finishes
 *     animating in.
 *
 * Add members only when a new one-shot trigger cannot be expressed as a
 * persistent settings flag or a slot-state join.
 */
export type RequestKey = 'paletteOpened';
