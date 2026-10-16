/**
 * `setVisibility`'s write: one boolean field, at a cluster's root or in one item row, copied
 * on write so untouched clusters and rows keep their references. It sets a field and never
 * replaces a row. Every record is complete, so a missing cluster, row or switch throws
 * rather than minting one (a new root `enabled` would read as a section switch).
 */

import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { SetVisibilityPayload } from '../../@types/settings/SetVisibilityPayload';
import { settingsClusterOf } from '../../utils/visibility/settingsClusterOf';

export function writeVisibilitySwitch(
  settings: EngineSettingsState,
  { cluster, item, field, on }: SetVisibilityPayload,
): EngineSettingsState {
  const current = settingsClusterOf(settings, cluster);
  const row = item === undefined ? current : current.items?.[item];
  if (typeof row?.[field] !== 'boolean') {
    throw new Error(
      `setVisibility: no '${field}' switch at ${cluster}${item ? `.items.${item}` : ''}`,
    );
  }
  const next =
    item === undefined
      ? { ...current, [field]: on }
      : { ...current, items: { ...current.items, [item]: { ...row, [field]: on } } };
  return { ...settings, [cluster]: next } as EngineSettingsState;
}
