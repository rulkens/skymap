/**
 * scopedVisibilityActions — resolve one `'family:scope'` show/hide entry to
 * its targeted settings action(s).
 *
 * The per-item counterpart of `VISIBILITY_ACTION_ROW`: where a row factory
 * fans a bare layer key out over EVERY registered item, a scoped entry names
 * one item (or one named slice) and gets exactly the action(s) for it. Both
 * dispatch the same settings creators the UI does, so the reactive
 * settings→fade bridge animates the change identically to a panel toggle.
 *
 * Families and label scopes are DATA TABLES (not predicate chains) — adding a
 * family or a label scope is one row. The `label:` table's miss arm is the
 * per-category case: any scope that isn't a named slice is a `StructureId`
 * (the template-literal type admits nothing else).
 */

import type { Action } from '@reduxjs/toolkit';

import type { ScopedVisibilityArg } from '../../@types/animation/ScopedVisibilityArg';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import {
  setGalaxyCatalogVisible,
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../state/settings/settingsSlice';
import { VISIBILITY_ACTION_ROW } from './visibilityActionRow';

type ScopeHandler = (
  scope: string,
  on: boolean,
  settings: EngineSettingsState,
) => readonly Action[];

/** Named label slices that span whole rows; a miss means a single category. */
const LABEL_SLICES: Record<
  string,
  (on: boolean, settings: EngineSettingsState) => readonly Action[]
> = {
  milkyWay: (on, settings) => VISIBILITY_ACTION_ROW.milkyWayLabel.actions(on, settings),
  survey: (on, settings) => VISIBILITY_ACTION_ROW.surveyLabel.actions(on, settings),
  structure: (on, settings) => VISIBILITY_ACTION_ROW.structureLabel.actions(on, settings),
};

const FAMILIES: Record<'survey' | 'structureRing' | 'label', ScopeHandler> = {
  survey: (scope, on) => [setGalaxyCatalogVisible({ id: scope as GalaxyCatalogId, enabled: on })],
  structureRing: (scope, on) => [
    setStructureItemEnabled({ id: scope as StructureId, enabled: on }),
  ],
  label: (scope, on, settings) =>
    LABEL_SLICES[scope]?.(on, settings) ?? [
      setStructureLabelEnabled({ id: scope as StructureId, enabled: on }),
    ],
};

export function scopedVisibilityActions(
  arg: ScopedVisibilityArg,
  on: boolean,
  settings: EngineSettingsState,
): readonly Action[] {
  // Split on the FIRST ':' — scopes themselves never contain one.
  const sep = arg.indexOf(':');
  const family = arg.slice(0, sep) as keyof typeof FAMILIES;
  return FAMILIES[family](arg.slice(sep + 1), on, settings);
}
