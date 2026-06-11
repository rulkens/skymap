/**
 * selectFlow — pure projection of the CF4++ flow-overlay settings slice.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectFlow, …)` and the flow renderer reads the
 * same `state.settings.flow` slice each frame.
 *
 * ### Why this returns the stored OBJECT verbatim
 *
 * Unlike the primitive-leaf selectors (`selectFilamentsEnabled` returns a
 * boolean, compared by value), flow's user-facing state is a whole
 * `FlowSettings` object. `useSyncExternalStore`'s `getSnapshot` must return a
 * referentially-STABLE value when nothing changed, or React warns and can loop.
 *
 * Returning `state.flow` UNMAPPED satisfies that: under copy-on-write the stored
 * object only gets a new reference when a `setFlow` write actually lands, and is
 * unchanged when a sibling cluster moves. Mapping or spreading here
 * (`{ ...state.flow }`) would mint a fresh object on every read and break the
 * stability contract — so this selector hands back the stored reference as-is.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { FlowSettings } from '../../../../@types/settings/FlowSettings';

export function selectFlow(state: EngineSettingsState): FlowSettings {
  return state.flow;
}
