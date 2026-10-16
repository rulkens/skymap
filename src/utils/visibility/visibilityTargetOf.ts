/**
 * Where one identity's fade is heading: switch on, its gating slot (if any) committed, and,
 * for a label with `of`, the labelled thing's own target for the same item (undefined for an
 * item-less label). One rule for every entry; the data decides where each term binds.
 */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import type { VisibilityGates } from '../../@types/engine/state/VisibilityGates';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { fadeIdentityKey } from './fadeIdentityKey';
import { visibilityAddressOf } from './visibilityAddressOf';
import { visibilitySwitchOf } from './visibilitySwitchOf';

export function visibilityTargetOf(
  settings: EngineSettingsState,
  entries: readonly VisibilityEntry[],
  entry: VisibilityEntry,
  item: string | undefined,
  gates: VisibilityGates,
): 0 | 1 {
  if (!visibilitySwitchOf(settings, entry, item)) return 0;
  const gate = gates.get(fadeIdentityKey({ address: visibilityAddressOf(entry), item }));
  if (gate !== undefined && gate.committed() === null) return 0;
  if ('key' in entry || entry.of === undefined) return 1;
  const thing = entries.find((e) => 'key' in e && e.key === entry.of);
  if (thing === undefined) throw new Error(`label:${entry.label}: of '${entry.of}' is no entry`);
  return visibilityTargetOf(settings, entries, thing, item, gates);
}
