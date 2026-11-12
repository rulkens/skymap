/**
 * galaxyCatalogSelectionRow — the Layer's `SelectionKindRow` for per-point galaxy
 * catalogs. A ref's index is the record ordinal (it drifts on a tier swap;
 * the selection reconciler re-anchors by durable id); rows and decodes go
 * through the record bridge, so a lookup still loading answers `pending`
 * instead of failing.
 * `claims` makes the pgc-/sdss-/pos@/famous branches mutually exclusive
 * (composeSelectionRows.ts).
 */

import { GALAXY_CATALOG_SOURCES } from '../sources/galaxyCatalogSources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { encodeGalaxyId } from './utils/encodeGalaxyId';
import { cartesianToRaDec } from '../../../utils/math/cartesianToRaDec';
import { placedGalaxyRow } from './utils/placedGalaxyRow';
import { FAMOUS_GALAXY_NAMES } from '../famousGalaxies/data/famousGalaxyNames.generated';
import { famousGalaxyNamesFor } from '../famousGalaxies/utils/famousGalaxyNamesFor';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { GalaxyCatalogSelectionRecords } from './@types/GalaxyCatalogSelectionRecords';
import type { GalaxyCatalogRef } from './@types/GalaxyCatalogRef';
import type { FocusResolution } from '../../../@types/engine/selection/FocusResolution';

/** Strict pos@ form, anchored at both ends: `<ra>,<dec>` (legacy) or `<ra>,<dec>,<dMpc>`. */
const POS_RE = /^pos@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/;

export function galaxyCatalogSelectionRow(
  runtime: GalaxyCatalogSelectionRecords,
): SelectionKindRow<GalaxyCatalogRef> {
  return {
    type: 'galaxyCatalog',
    pickSources: GALAXY_CATALOG_SOURCES.map(runtime.pickCodes.pickCodeOf),
    // A released source has no record: its picks and refs map to nothing.
    resolvePick: (pick) => {
      const source = runtime.pickCodes.catalogOfPickCode(pick.sourceCode);
      if (source === null) return null;
      const index = runtime.records.get(source)?.ordinalOfPick(pick.localIdx) ?? null;
      return index === null ? null : { type: 'galaxyCatalog', source, index };
    },
    encodePick: (ref) => {
      const pick = runtime.records.get(ref.source)?.pickOfOrdinal(ref.index) ?? null;
      return pick === null
        ? null
        : packSelection(runtime.pickCodes.pickCodeOf(ref.source), pick + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref) => {
      const row = runtime.recordBridge.row(ref.source, ref.index);
      return row === null ? null : placedGalaxyRow(row);
    },
    focusId: {
      claims: (id) =>
        id.startsWith('pgc-') ||
        id.startsWith('sdss-') ||
        id.startsWith('pos@') ||
        FAMOUS_GALAXY_NAMES.some((m) => m.id === id),
      decode: (id) => {
        if (id.startsWith('pgc-') || id.startsWith('sdss-')) {
          return runtime.recordBridge.resolveDurableId(id);
        }
        if (id.startsWith('pos@')) {
          const m = POS_RE.exec(id);
          if (!m) return { kind: 'absent' };
          const raDeg = parseFloat(m[1]!);
          const decDeg = parseFloat(m[2]!);
          const distMpc = m[3] === undefined ? null : parseFloat(m[3]);
          return Number.isFinite(raDeg) && Number.isFinite(decDeg)
            ? runtime.recordBridge.resolvePosition(raDeg, decDeg, distMpc)
            : { kind: 'absent' };
        }
        return resolveFamous(id, runtime);
      },
      encode: (ref) => encodeGalaxy(ref, runtime),
    },
  };
}

/** A compiled-in id resolves once `famous.bin` is resident; the meta sidecar is not waited on. */
function resolveFamous(
  id: string,
  deps: GalaxyCatalogSelectionRecords,
): FocusResolution<GalaxyCatalogRef> {
  const record = deps.records.get('famousGalaxy');
  if (!record) return { kind: 'pending' };
  const index = famousGalaxyNamesFor(record.recordCount)?.findIndex((m) => m.id === id) ?? -1;
  if (index < 0) return { kind: 'absent' };
  return { kind: 'hit', ref: { type: 'galaxyCatalog', source: 'famousGalaxy', index } };
}

function encodeGalaxy(ref: GalaxyCatalogRef, deps: GalaxyCatalogSelectionRecords): string | null {
  const row = deps.recordBridge.row(ref.source, ref.index);
  if (!row) return null;
  const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);
  return encodeGalaxyId({
    source: ref.source,
    famousId: row.famous?.id ?? null,
    objId: BigInt(row.objId),
    ra,
    dec,
    // buildGalaxyInfo's distanceMpc formula, so both encoders emit one id.
    distMpc: Math.sqrt(row.x * row.x + row.y * row.y + row.z * row.z),
  });
}
