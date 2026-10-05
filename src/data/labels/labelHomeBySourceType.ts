/**
 * LABEL_HOME_BY_SOURCE_TYPE — where each label-bearing source type keeps its
 * per-category label bit, and how to write it.
 *
 * Callers resolve a category's home with
 * `LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[cat]]`, so a new
 * label-bearing source type is ONE row here rather than a fresh branch in both
 * the read projection and the container's write handler. The alternative is a
 * pair of hardcoded chains kept in mirror-image agreement by hand —
 * `isStructureId → === 'milkyWay' → else galaxy-catalog`, spelled once for
 * reads and once for writes.
 *
 * `milkyWay` is a row like any other. Its `read`/`write` reach a singleton
 * scalar rather than an `items` record — a genuine difference (one disk, one
 * "You are here" label, no per-record catalog), so it is expressed as that
 * row's implementation rather than smoothed away by synthesising a one-entry
 * items record, which would pretend the overlay is a catalog.
 *
 * The `as StructureId` / `as GalaxyCatalogId` / `as StarCatalogId` / `as
 * BodyId` / `as BlackHoleId` casts are the table's one
 * unavoidable seam: `LabelHome.read` is uniform over `LabelCategory` (that is
 * what makes the table a `Record`), while each row indexes a record keyed by
 * its own narrower id union. The registry lookup that selects the row is what
 * guarantees the cast holds.
 */

import type { LabelHome } from '../../@types/settings/LabelHome';
import type { LabelBearingSourceType } from '../../@types/data/LabelBearingSourceType';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BlackHoleId } from '../../@types/data/blackHole/BlackHoleId';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import { setStructureLabelEnabled } from '../../layers/structure/state/structures/slice';
import { setMilkyWayLabelEnabled } from '../../layers/milkyWay/state/milkyWay/slice';
import { setGalaxyCatalogLabelEnabled } from '../../layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setStarCatalogLabelEnabled } from '../../layers/starCatalog/state/starCatalogs/slice';
import { setBodyLabelEnabled } from '../../layers/body/state/bodies/slice';
import { setBlackHoleLabelEnabled } from '../../layers/blackHoles/state/blackHoles/slice';

export const LABEL_HOME_BY_SOURCE_TYPE: Readonly<Record<LabelBearingSourceType, LabelHome>> = {
  structure: {
    read: (homes, id) => homes.structures[id as StructureId].labelEnabled,
    write: (id, enabled) => setStructureLabelEnabled({ id: id as StructureId, enabled }),
  },
  galaxyCatalog: {
    read: (homes, id) => homes.galaxyCatalogs[id as GalaxyCatalogId].labelEnabled,
    write: (id, enabled) => setGalaxyCatalogLabelEnabled({ id: id as GalaxyCatalogId, enabled }),
  },
  starCatalog: {
    read: (homes, id) => homes.starCatalogs[id as StarCatalogId].labelEnabled,
    write: (id, enabled) => setStarCatalogLabelEnabled({ id: id as StarCatalogId, enabled }),
  },
  body: {
    read: (homes, id) => homes.bodies[id as BodyId].labelEnabled,
    write: (id, enabled) => setBodyLabelEnabled({ id: id as BodyId, enabled }),
  },
  blackHole: {
    read: (homes, id) => homes.blackHoles[id as BlackHoleId].labelEnabled,
    write: (id, enabled) => setBlackHoleLabelEnabled({ id: id as BlackHoleId, enabled }),
  },
  // The singleton overlay: one scalar, no per-record row to index.
  milkyWay: {
    read: (homes) => homes.milkyWayLabelEnabled,
    write: (_id, enabled) => setMilkyWayLabelEnabled(enabled),
  },
};
