/**
 * coreSelectionRows — the six rows core owns, one per `SelectionRef['type']`.
 * `deps` is read lazily by each row (a thunk over live engine resources), not
 * called here, so a boot-window deep link resolves before any cloud lands.
 */

import { galaxyCatalogSelectionRow } from './galaxyCatalogSelectionRow';
import { structureSelectionRow } from './structureSelectionRow';
import { milkyWaySelectionRow } from './milkyWaySelectionRow';
import { zoneOfAvoidanceSelectionRow } from './zoneOfAvoidanceSelectionRow';
import { bodySelectionRow } from './bodySelectionRow';
import { starSelectionRow } from './starSelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

export function coreSelectionRows(deps: () => ResolveDeps): readonly SelectionKindRow[] {
  return [
    galaxyCatalogSelectionRow(deps),
    structureSelectionRow(deps),
    milkyWaySelectionRow(),
    zoneOfAvoidanceSelectionRow(),
    bodySelectionRow(),
    starSelectionRow(deps),
  ];
}
