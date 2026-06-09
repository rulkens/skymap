/**
 * seedSettingsCallbacks — fan-out helper that fires every optional
 * settings-echo callback once with the engine's startup defaults.
 *
 * ### Why this exists
 *
 * The engine maintains the *truth* for every setting React mirrors
 * (point size, brightness, auto-rotate, tone-map curve, exposure,
 * source visibility mask, …).  React's components initialise their
 * own state from hard-coded defaults, but the engine is allowed to
 * clamp/override those values on startup.  To prevent silent drift,
 * the engine fires each `onXChange` callback *once* at init with its
 * actual default.
 *
 * That used to be ~14 hand-rolled `cb.onPointSizeChange?.(pointSizePx)`
 * lines at the bottom of the async IIFE.  Pulling them into one helper:
 *
 *   - Lets every callback fire from a single audited code path, so
 *     adding a new setting is a one-line edit to `Snapshot` + the
 *     fan-out body (and its test) instead of a fourth place to grep.
 *   - Keeps the engine's startup IIFE focused on imperative wiring
 *     rather than echo bookkeeping.
 *   - Makes it trivially unit-testable: pass a stub `cb` with vi.fn()
 *     spies and assert each gets called exactly once with the right
 *     value.  No GPU device, no async cloud load.
 *
 * The helper does *not* fire required callbacks (`onStatusChange`,
 * `onHoverChange`, `onSelectChange`) — those have stricter lifecycle
 * rules and the engine handles them inline.
 */

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { SettingsCallbackSeed } from '../../../@types/engine/wiring/SettingsCallbackSeed';

/**
 * Fire every optional settings callback in `cb` exactly once with the
 * matching value from `snapshot`.  Callbacks left undefined on `cb` are
 * silently skipped — the optional-chaining keeps each fan-out a no-op
 * when the React layer doesn't need that particular echo.
 *
 * Order is mostly cosmetic (subscribers shouldn't depend on it) but we
 * preserve the original engine.ts order so a behavioural diff against
 * the pre-refactor codebase shows zero call-order changes.
 */
export function seedSettingsCallbacks(cb: EngineCallbacks, snapshot: SettingsCallbackSeed): void {
  // H5 task 11: nested-only fires.  Each echo lands on its `EngineCallbacks`
  // sub-bag address so React consumers (subscribed via `useEngineSettings`)
  // observe the engine-truth defaults exactly once at startup.  The flat
  // siblings were deleted alongside this conversion; optional-chaining
  // keeps every fire safe when a consumer doesn't subscribe to that bag.
  cb.points?.onSizeChange?.(snapshot.pointSize);
  cb.points?.onBrightnessChange?.(snapshot.brightness);
  cb.camera?.onAutoRotateChange?.(snapshot.autoRotate);
  cb.thumbnails?.onEnabledChange?.(snapshot.galaxyTexturesEnabled);
  cb.points?.onHighlightFallbackChange?.(snapshot.highlightFallback);
  cb.points?.onRealOnlyChange?.(snapshot.realOnlyMode);
  cb.points?.onDepthFadeChange?.(snapshot.depthFadeEnabled);
  cb.debug?.onShowPickBufferChange?.(snapshot.showPickBuffer);
  cb.debug?.onShowDiskRadiusRingChange?.(snapshot.showDiskRadiusRing);
  cb.bias?.onModeChange?.(snapshot.biasMode);
  cb.bias?.onAbsMagLimitChange?.(snapshot.absMagLimit);
  cb.tonemap?.onCurveChange?.(snapshot.toneMapCurve);
  cb.tonemap?.onExposureChange?.(snapshot.exposure);
  cb.sources?.onMaskChange?.(snapshot.visibleSourceMask);
  // Fresh copies of each record so subscribers can treat every emission as an
  // immutable snapshot — same idiom as the live setter echoes. Label and marker
  // visibility are independent axes; the seed records are already derived from
  // `structures.items` (see deriveMarker/LabelCategoryVisibility), so both seed
  // the React mirror at init.
  cb.labels?.onLabelCategoryVisibilityChange?.({ ...snapshot.labelCategoryVisibility });
  cb.labels?.onMarkerCategoryVisibilityChange?.({ ...snapshot.markerCategoryVisibility });
}
