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
 * UI slice (palette / hide-UI / debug + splash).
 */

export const settingsRoute = 'settings' as const;
export const uiRoute = 'ui' as const;
export const tierRoute = 'tier' as const;
