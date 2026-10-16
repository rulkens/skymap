/**
 * The settings switch behind one entry (and item). The section rule lives here and nowhere
 * else: a per-item show switch is also off while its cluster's section switch is. A label
 * reads its own `labelEnabled` alone; it reaches its section through `of`. A value that is
 * not a boolean throws: every item record is complete, so it is a wrong entry.
 */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { hasSectionSwitch } from './hasSectionSwitch';
import { settingsClusterOf } from './settingsClusterOf';
import { visibilityClusterOf } from './visibilityClusterOf';

export function visibilitySwitchOf(
  settings: EngineSettingsState,
  entry: VisibilityEntry,
  item?: string,
): boolean {
  const isShow = 'key' in entry;
  const name = visibilityClusterOf(entry);
  const field = isShow ? 'enabled' : 'labelEnabled';
  const where = item === undefined ? `${name}.${field}` : `${name}.items.${item}.${field}`;
  const cluster = settingsClusterOf(settings, name);
  const own = item === undefined ? cluster[field] : cluster.items?.[item]?.[field];
  if (typeof own !== 'boolean') throw new Error(`visibility switch ${where} is not a boolean`);
  if (item === undefined || !isShow || !hasSectionSwitch(settings, name)) return own;
  return cluster.enabled === true && own;
}
