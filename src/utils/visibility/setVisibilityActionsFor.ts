/**
 * The writes one cue arg makes: the one cue path for bare, scoped and label addresses alike,
 * shared by `applySceneEffect` and `computeSceneEntering` so the tour fold cannot drift from
 * playback. A bare per-item show address writes its section switch where the cluster has
 * one, else every item; a label cue only ever writes `labelEnabled`. `overMs` rides every
 * write to the reactive fade sync; the reducer never reads it.
 */

import type { ScopedVisibilityAddress } from '../../@types/animation/ScopedVisibilityAddress';
import type { VisibilityAddress } from '../../@types/animation/VisibilityAddress';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { setVisibility } from '../../state/settings/setVisibilityAction';
import { hasSectionSwitch } from './hasSectionSwitch';
import { splitVisibilityAddress } from './splitVisibilityAddress';
import { visibilityClusterOf } from './visibilityClusterOf';
import { visibilityEntryOf } from './visibilityEntryOf';

export function setVisibilityActionsFor(
  settings: EngineSettingsState,
  arg: VisibilityAddress | ScopedVisibilityAddress,
  on: boolean,
  overMs?: number,
): readonly ReturnType<typeof setVisibility>[] {
  const { bare, item: scopedItem } = splitVisibilityAddress(arg);
  const entry = visibilityEntryOf(APP_VISIBILITY_REGISTRY, bare as VisibilityAddress);
  const isLabel = !('key' in entry);
  const cluster = visibilityClusterOf(entry);
  const field = isLabel ? 'labelEnabled' : 'enabled';
  const write = (item?: string) =>
    setVisibility({
      cluster,
      field,
      on,
      ...(item !== undefined ? { item } : {}),
      ...(overMs !== undefined ? { overMs } : {}),
    });
  if (scopedItem !== undefined) return [write(scopedItem)];
  if (entry.items === undefined || (!isLabel && hasSectionSwitch(settings, cluster))) {
    return [write()];
  }
  return entry.items.map((item) => write(item));
}
