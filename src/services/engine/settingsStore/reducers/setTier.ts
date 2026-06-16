/**
 * setTier — pure reducer for the cross-cutting data-resolution preset.
 *
 * Top-level copy-on-write (new root object, `tier` replaced) — there is no
 * nested cluster to spread because `tier` is a flat root field (it's read by
 * galaxy-catalog, volume, and filament demand alike, so it lives outside any
 * one source cluster; see `EngineSettingsState`). Returning a fresh object
 * rather than mutating in place is the shared settings-reducer contract: it's
 * the ref change that lets React selectors over the store see the new value.
 *
 * The reducer stores the tier VERBATIM — it has no side effects. The
 * catalog/volume reload that a tier change must trigger lives in the engine
 * handle's `setTier` (which diffs prev→next and re-drives the asset slots),
 * not here. Keeping the reducer pure means it stays trivially unit-testable
 * and the action layer adds nothing but the `setState` call.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { Tier } from '../../../../@types/data/Tier';

export function setTier(state: EngineSettingsState, tier: Tier): EngineSettingsState {
  return { ...state, tier };
}
