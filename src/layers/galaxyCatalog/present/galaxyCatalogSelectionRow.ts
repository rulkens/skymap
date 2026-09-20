/**
 * galaxyCatalogSelectionRow — the Layer's `SelectionKindRow` for per-point galaxy
 * catalogs. Pick identity is positional (index drifts on a tier swap; the
 * tier saga re-anchors by durable id). Focus-id decode dispatches over the
 * pgc-/sdss-/pos@/famous branches; order doesn't matter because `claims`
 * makes each branch mutually exclusive by construction (composeSelectionRows.ts).
 */

import { Source, GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { extractGalaxyRow } from './extractGalaxyRow';
import { encodeGalaxyId } from '../../../services/url/encodeGalaxyId';
import { cartesianToRaDec } from '../../../utils/math/cartesianToRaDec';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

type GalaxyCatalogRef = Extract<SelectionRef, { type: 'galaxyCatalog' }>;
/** The two live reads every branch here makes; the runtime satisfies it. */
type Catalogs = Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;

/** Strict pos@ form, anchored at both ends — matches focusUrl.ts. */
const POS_RE = /^pos@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
const POS_THRESHOLD_SQ_ARCSEC = 30 * 30;

export function galaxyCatalogSelectionRow(runtime: Catalogs): SelectionKindRow<GalaxyCatalogRef> {
  return {
    type: 'galaxyCatalog',
    pickSources: GALAXY_CATALOG_SOURCES,
    resolvePick: (_entry, pick) => ({
      type: 'galaxyCatalog',
      source: pick.sourceCode as GalaxyCatalogSourceType,
      index: pick.localIdx,
    }),
    extractRow: (ref) =>
      extractGalaxyRow(runtime.catalogs.get(ref.source), ref.index, ref.source, runtime.famousMeta),
    focusId: {
      claims: (id) =>
        id.startsWith('pgc-') ||
        id.startsWith('sdss-') ||
        id.startsWith('pos@') ||
        runtime.famousMeta.some((m) => m.id === id),
      decode: (id) => {
        if (id.startsWith('pgc-')) {
          const n = id.slice(4);
          return /^\d+$/.test(n) ? resolvePgc(BigInt(n), runtime) : null;
        }
        if (id.startsWith('sdss-')) {
          const n = id.slice(5);
          return /^\d+$/.test(n) ? resolveSdss(BigInt(n), runtime) : null;
        }
        if (id.startsWith('pos@')) {
          const m = POS_RE.exec(id);
          if (!m) return null;
          const raDeg = parseFloat(m[1]!);
          const decDeg = parseFloat(m[2]!);
          return Number.isFinite(raDeg) && Number.isFinite(decDeg)
            ? resolvePos(raDeg, decDeg, runtime)
            : null;
        }
        return resolveFamous(id, runtime);
      },
      encode: (ref) => encodeGalaxy(ref, runtime),
    },
  };
}

function resolveFamous(id: string, deps: Catalogs): GalaxyCatalogRef | null {
  for (let i = 0; i < deps.famousMeta.length; i++) {
    if (deps.famousMeta[i]!.id === id) {
      if (!deps.catalogs.get(Source.FamousGalaxy)) return null;
      return { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: i };
    }
  }
  return null;
}

function resolvePgc(pgc: bigint, deps: Catalogs): GalaxyCatalogRef | null {
  for (const source of [Source.Glade, Source.TwoMRS] as const) {
    const cloud = deps.catalogs.get(source);
    if (!cloud) continue;
    const idx = findObjId(cloud.objIDs, pgc);
    if (idx >= 0) return { type: 'galaxyCatalog', source, index: idx };
  }
  return null;
}

function resolveSdss(objID: bigint, deps: Catalogs): GalaxyCatalogRef | null {
  const cloud = deps.catalogs.get(Source.SDSS);
  if (!cloud) return null;
  const idx = findObjId(cloud.objIDs, objID);
  return idx >= 0 ? { type: 'galaxyCatalog', source: Source.SDSS, index: idx } : null;
}

/**
 * Nearest-neighbour search across every galaxy catalog source within 30
 * arcsec (the `buildFamous.ts` cross-match envelope).
 */
function resolvePos(raDegT: number, decDegT: number, deps: Catalogs): GalaxyCatalogRef | null {
  const cosDecT = Math.cos((decDegT * Math.PI) / 180);
  let bestSqArcsec = Infinity;
  let bestSource: GalaxyCatalogSourceType | null = null;
  let bestIdx = -1;

  for (const source of GALAXY_CATALOG_SOURCES) {
    const cloud = deps.catalogs.get(source);
    if (!cloud) continue;
    const positions = cloud.positions;
    for (let i = 0; i < cloud.count; i++) {
      const x = positions[i * 3 + 0]!;
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      const [raDeg, decDeg] = cartesianToRaDec(x, y, z);
      const ddec = decDeg - decDegT;
      const dra = (((raDeg - raDegT + 540) % 360) - 180) * cosDecT;
      const sqArcsec = (ddec * ddec + dra * dra) * 3600 * 3600;
      if (sqArcsec < bestSqArcsec) {
        bestSqArcsec = sqArcsec;
        bestSource = source;
        bestIdx = i;
      }
    }
  }

  return bestSource !== null && bestSqArcsec <= POS_THRESHOLD_SQ_ARCSEC
    ? { type: 'galaxyCatalog', source: bestSource, index: bestIdx }
    : null;
}

function findObjId(haystack: BigUint64Array, needle: bigint): number {
  for (let i = 0; i < haystack.length; i++) {
    if (haystack[i] === needle) return i;
  }
  return -1;
}

function encodeGalaxy(ref: GalaxyCatalogRef, deps: Catalogs): string | null {
  const row = extractGalaxyRow(
    deps.catalogs.get(ref.source),
    ref.index,
    ref.source,
    deps.famousMeta,
  );
  if (!row) return null;
  const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);
  return encodeGalaxyId({
    source: ref.source,
    famousId: row.famous?.id ?? null,
    objId: BigInt(row.objId),
    ra,
    dec,
  });
}
