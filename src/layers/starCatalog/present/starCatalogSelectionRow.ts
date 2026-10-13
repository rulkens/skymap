/**
 * starCatalogSelectionRow — one selection kind for all four star catalogs. A
 * seeded pick names its table row (durable id, live position); a survey pick
 * names the catalog record ordinal, stable per bake. The pick draw stamps a
 * pool-absolute index instead, so the renderer maps it both ways and a chunk
 * that is not resident (evicted under a pick, or never loaded) resolves to
 * null. THREE seed tables (famousStar, sun, sStar), never merged — `ref.index`
 * indexes ONE.
 */

import { SOLAR_RADIUS_KM } from '../../../data/bodies/solarRadiusKm';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import { STAR_FOCUS_PREFIX } from '../../../services/url/starFocusId';
import { encodeStarFocusId } from '../../../services/url/encodeStarFocusId';
import { decodeStarFocusId } from '../../../services/url/decodeStarFocusId';
import { resolveStarRecord } from '../../../services/engine/helpers/resolveStarRecord';
import { starResidency } from '../load/starResidency';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { STAR_CATALOG_SOURCE_ROWS } from '../sources/starCatalogSourceRows';
import { SURFACE_STANDOFF_RADII } from '../../../utils/camera/clampDistance';
import type { DriverGeometry } from '../../../@types/engine/camera/DriverGeometry';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import type { SourceType } from '../../../@types/data/SourceType';

type StarCatalogRef = Extract<SelectionRef, { type: 'starCatalog' }>;

/** The headline a survey star gets: the bin carries no identity of its own. */
const FIELD_STAR_LABEL = 'Field star';

/**
 * A star is one radius all the way through — the photosphere is hull, ground
 * and footprint at once. A survey star poses from no table (`poseId` null), so
 * the camera never targets or follows it, but it still frames and haloes.
 */
function starDriver(poseId: string | null, radiusM: number): DriverGeometry {
  return {
    poseId,
    boundingRadiusM: radiusM,
    footprintRadiusM: radiusM,
    groundRadiusM: radiusM,
    standoffRadii: SURFACE_STANDOFF_RADII,
  };
}

/** The committed survey catalog of `source`, or null before it lands. */
function catalogOf(runtime: Pick<StarCatalogRuntime, 'renderer'>, source: SourceType) {
  for (const loaded of runtime.renderer.loadedCatalogs()) {
    if (loaded.source === source) return loaded.octree;
  }
  return null;
}

export function starCatalogSelectionRow(
  runtime: Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams'>,
): SelectionKindRow<StarCatalogRef> {
  return {
    type: 'starCatalog',
    pickSources: STAR_CATALOG_SOURCE_ROWS.map(([code]) => code),
    resolvePick: (_entry, pick) => {
      const source = pick.sourceCode as StarCatalogSourceType;
      const index = SEEDED_STAR_CATALOGS_BY_SOURCE.has(source)
        ? pick.localIdx
        : runtime.renderer.recordOrdinal(source, pick.localIdx);
      return index === null ? null : { type: 'starCatalog', source, index };
    },
    encodePick: (ref) => {
      const index = SEEDED_STAR_CATALOGS_BY_SOURCE.has(ref.source)
        ? ref.index
        : runtime.renderer.poolRecordIndex(ref.source, ref.index);
      return index === null ? null : packSelection(ref.source, index + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref, simDays) => {
      const seededRow = SEEDED_STAR_CATALOGS_BY_SOURCE.get(ref.source);
      if (seededRow) {
        const star = seededRow.stars[ref.index];
        if (!star) return null;
        // The S-stars orbit, so a seeded star's position is the caller's instant,
        // never cached; the famous stars and the Sun are static anchors in it.
        const p = deriveBodyStates(simDays).get(star.id)!.positionMpc;
        return {
          type: 'starCatalog',
          source: ref.source,
          index: ref.index,
          id: star.id,
          label: star.label,
          positionMpc: [p[0], p[1], p[2]],
          radiusM: star.surface.datumRadiusM,
          driver: starDriver(star.id, star.surface.datumRadiusM),
        };
      }
      const catalog = catalogOf(runtime, ref.source);
      if (!catalog) return null;
      const record = resolveStarRecord(catalog, starResidency(runtime, ref.source), ref.index);
      if (!record) return null;
      const radiusM = SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M;
      return {
        type: 'starCatalog',
        source: ref.source,
        index: ref.index,
        id: null,
        label: FIELD_STAR_LABEL,
        positionMpc: record.positionMpc,
        radiusM,
        absMag: record.absMag,
        bpRp: record.bpRp,
        driver: starDriver(null, radiusM),
      };
    },
    focusId: {
      claims: (id) => id.startsWith(STAR_FOCUS_PREFIX),
      decode: (id) => decodeStarFocusId(id, [...runtime.renderer.loadedCatalogs()].length > 0),
      encode: (ref) => encodeStarFocusId(ref),
    },
  };
}
