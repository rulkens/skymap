/**
 * Store route constants — the string keys under which each slice mounts in the
 * Redux store's `combineReducers` map.
 *
 * A route is named once, here, rather than as an inline string literal at the
 * `combineReducers` call site, so the same key is reused by the reducer wiring
 * AND by the selectors that read the slice (`state[settingsRoute]`). The literal
 * type (`'settings'`, not `string`) flows through `combineReducers` so that
 * `RootState` gains a typed `settings` slot — a misspelt selector key then fails
 * at compile time instead of returning `undefined` at runtime.
 *
 * The selection fold adds its sibling routes here too: one constant per
 * top-level slice, so growing the store is an additive edit to this file rather
 * than a hunt through reducer-wiring and selector call sites. `tierRoute` is the
 * data-resolution preset lifted out of the settings slice into its own root
 * slice so a settings/tour restore can't sweep it; `uiRoute` is the app-level
 * UI slice (palette / hide-UI / debug + splash); `cameraRoute` is the camera
 * Intent slice (base pose, tween descriptor, auto-rotate, dragging flag);
 * `selectionRoute` / `selectionRowsRoute` hold the selection Intent (focus +
 * select refs) and its reconciled rows.
 */

export const settingsRoute = 'settings' as const;
export const uiRoute = 'ui' as const;
export const tierRoute = 'tier' as const;
export const cameraRoute = 'camera' as const;
export const selectionRoute = 'selection' as const;
export const selectionRowsRoute = 'selectionRows' as const;
// `tourRoute` is the guided-tour runtime slice (active / tourId / beatIndex /
// paused / dwellNonce) — the single-writer state the tour sagas drive and the
// TourOverlay reads; everything else it shows derives from the registry.
export const tourRoute = 'tour' as const;
// `engineRoute` is the engine runtime slice — lifecycle status, per-source and
// per-structure counts, load progress, and the scale-bar descriptor. Written
// by the engine via action dispatches; read by React UI components.
export const engineRoute = 'engine' as const;
