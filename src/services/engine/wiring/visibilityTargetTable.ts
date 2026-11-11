/**
 * Every fade identity with its visibility target under each of `settings`: a clip seed's table
 * (the targets before and after each scene step), by the rule `syncVisibilityTargets` applies.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';
import { fadeIdentitiesOf } from '../../../utils/visibility/fadeIdentitiesOf';
import { visibilityTargetOf } from '../../../utils/visibility/visibilityTargetOf';

export function visibilityTargetTable(
  state: Pick<EngineState, 'visibilityEntries' | 'visibilityGates'>,
  settings: readonly EngineSettingsState[],
) {
  const { visibilityEntries: entries, visibilityGates: gates } = state;
  return entries.flatMap((entry) =>
    fadeIdentitiesOf(entry).map((id) => ({
      id,
      targets: settings.map((s) => visibilityTargetOf(s, entries, entry, id.item, gates)),
    })),
  );
}
