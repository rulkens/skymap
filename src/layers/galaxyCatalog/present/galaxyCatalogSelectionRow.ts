/**
 * galaxyCatalogSelectionRow — the Layer's `SelectionKindRow` for per-point galaxy
 * catalogs. A ref's index is the record ordinal (it drifts on a tier swap; the
 * tier saga re-anchors by durable id); rows and decodes go through the record
 * bridge, so a lookup still loading defers instead of failing. `claims` makes the
 * pgc-/sdss-/pos@/famous branches mutually exclusive (composeSelectionRows.ts).
 */

import { Source, GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { encodeGalaxyId } from '../../../services/url/encodeGalaxyId';
import { cartesianToRaDec } from '../../../utils/math/cartesianToRaDec';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

type GalaxyCatalogRef = Extract<SelectionRef, { type: 'galaxyCatalog' }>;
/** The live reads every branch here makes; the runtime satisfies it. */
type Records = Pick<GalaxyCatalogRuntime, 'records' | 'recordBridge' | 'famousMeta'>;

/** Strict pos@ form, anchored at both ends: `<ra>,<dec>` (legacy) or `<ra>,<dec>,<dMpc>`. */
const POS_RE = /^pos@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/;

export function galaxyCatalogSelectionRow(runtime: Records): SelectionKindRow<GalaxyCatalogRef> {
  return {
    type: 'galaxyCatalog',
    pickSources: GALAXY_CATALOG_SOURCES,
    // A released source has no record: its picks and refs map to nothing.
    resolvePick: (_entry, pick) => {
      const source = pick.sourceCode as GalaxyCatalogSourceType;
      const index = runtime.records.get(source)?.ordinalOfPick(pick.localIdx) ?? null;
      return index === null ? null : { type: 'galaxyCatalog', source, index };
    },
    encodePick: (ref) => {
      const pick = runtime.records.get(ref.source)?.pickOfOrdinal(ref.index) ?? null;
      return pick === null ? null : packSelection(ref.source, pick + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref) => runtime.recordBridge.row(ref.source, ref.index),
    focusId: {
      claims: (id) =>
        id.startsWith('pgc-') ||
        id.startsWith('sdss-') ||
        id.startsWith('pos@') ||
        runtime.famousMeta.some((m) => m.id === id),
      decode: (id) => {
        if (id.startsWith('pgc-') || id.startsWith('sdss-')) {
          return runtime.recordBridge.resolveDurableId(id);
        }
        if (id.startsWith('pos@')) {
          const m = POS_RE.exec(id);
          if (!m) return null;
          const raDeg = parseFloat(m[1]!);
          const decDeg = parseFloat(m[2]!);
          const distMpc = m[3] === undefined ? null : parseFloat(m[3]);
          return Number.isFinite(raDeg) && Number.isFinite(decDeg)
            ? runtime.recordBridge.resolvePosition(raDeg, decDeg, distMpc)
            : null;
        }
        return resolveFamous(id, runtime);
      },
      encode: (ref) => encodeGalaxy(ref, runtime),
    },
  };
}

function resolveFamous(id: string, deps: Records): GalaxyCatalogRef | null {
  for (let i = 0; i < deps.famousMeta.length; i++) {
    if (deps.famousMeta[i]!.id === id) {
      if (!deps.records.has(Source.FamousGalaxy)) return null;
      return { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: i };
    }
  }
  return null;
}

function encodeGalaxy(ref: GalaxyCatalogRef, deps: Records): string | null {
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
