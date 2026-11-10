/**
 * galaxyCatalogPlanner — the galaxy catalog Layer's once-per-frame facts row: reconciles the
 * alias index and the structure member counts against the live settings. Band-free (no
 * `hasDistanceBand`): a member count is a catalog fact, so it must not drop to famous-only
 * inside the deep-zoom band. The disks, which must, plan in `galaxyDisksPlanner`.
 */

import type { GalaxyCatalogId } from './@types/GalaxyCatalogId';
import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { GalaxyCatalogRuntime } from './@types/GalaxyCatalogRuntime';

import { buildAliasIndex } from './aliases/load/buildAliasIndex';
import { STRUCTURE_IDS_BY_SCALE } from '../../data/structure/structureIdsByScale';
import { structureMemberCount } from './structureMembership/utils/structureMemberCount';
import { visibleCatalogsOf } from './records/utils/visibleCatalogsOf';
import { setsEqual } from '../../utils/set/setsEqual';
import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import { isKind } from '../../utils/selection/isKind';
import type { StructureSelectionRow } from '../structure/selection/@types/StructureSelectionRow';

export function galaxyCatalogPlanner(
  runtime: GalaxyCatalogRuntime,
): Extract<FrameContentPlanner<void, 'survey'>, { scope: 'once' }> {
  // Tracks the `catalogsVersion` the alias index was last built against, so a
  // fresh publish fires only on a genuine catalog change (or the pgcAlias
  // sidecar's first arrival), never once per frame.
  let aliasIndexVersion = -1;
  // The (selected row identity, visible catalogs, catalogsVersion) triple the
  // member count was last computed against. `-1` never equals a real
  // catalogsVersion, so the very first frame always computes.
  let memberCountRow: SelectionRowBase | null = null;
  let memberCountCatalogs: ReadonlySet<GalaxyCatalogId> | null = null;
  let memberCountVersion = -1;

  return {
    name: 'galaxy-catalog',
    scope: 'once',
    fade: 'survey',
    plan(_snapshot, _views, state, fade) {
      const pgcAliasCommitted = runtime.pgcAlias.committed();
      if (pgcAliasCommitted !== null && runtime.catalogsVersion !== aliasIndexVersion) {
        aliasIndexVersion = runtime.catalogsVersion;
        runtime.publish({
          aliasIndex: buildAliasIndex({
            records: runtime.records.values(),
            aliasMap: pgcAliasCommitted.value,
          }),
        });
      }

      // Built from the handed value, so the counts keep a hidden catalog through its
      // fade-out, as the point sprites do.
      const visibleCatalogs = visibleCatalogsOf(fade);

      const selectRow = state.selectionRows.select;
      if (
        selectRow !== memberCountRow ||
        memberCountCatalogs === null ||
        !setsEqual(visibleCatalogs, memberCountCatalogs) ||
        runtime.catalogsVersion !== memberCountVersion
      ) {
        memberCountRow = selectRow;
        memberCountCatalogs = visibleCatalogs;
        memberCountVersion = runtime.catalogsVersion;
        runtime.publish({
          // Narrowed on the row's own tag, never a structural sniff — only a
          // `structure` arm of a cosmic category (one with galaxy members) is countable.
          structureMemberCount:
            isKind<StructureSelectionRow>(selectRow, 'structure') &&
            STRUCTURE_IDS_BY_SCALE.cosmic.includes(selectRow.category)
              ? structureMemberCount(selectRow, runtime.records, visibleCatalogs)
              : null,
        });
      }

      return { value: undefined, awake: false, settling: false, loading: false };
    },
  };
}
