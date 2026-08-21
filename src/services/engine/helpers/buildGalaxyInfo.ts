/**
 * buildGalaxyInfo — the PURE formatting half of the old galaxyInfoBuilder.
 *
 * Takes a serializable `GalaxyRow` (the cloud reads `extractGalaxyRow`
 * produced) and computes the full display-ready `GalaxyInfo`: sky coordinates,
 * distance, lookback, colours, IAU name, catalogue + thumbnail URLs, the
 * orientation/diameter provenance, the famous enrichment, and the display-name
 * ladder. Every helper it calls is a pure util, so this function imports no
 * engine state and no GPU — which is exactly why React can call it directly in
 * a memoized selector (the inverse of today's engine-bakes-GalaxyInfo flow).
 *
 * `row.objId` is the decimal string of the catalog objID; we parse it back to
 * a bigint once here because the SDSS/PGC URL + name logic compares it to 0n.
 */
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import {
  DESI_TRACER_CLASS,
  sourceClassLabel,
  milliquasParentSurveyPrefix,
} from '../../../data/galaxyCatalog/sourceClass';
import { famousDisplayName } from './famousDisplayName';
import { formatMorphology } from '../../../utils/format/formatMorphology';
import { famousWikipediaTitle } from '../../../utils/format/famousWikipediaTitle';
import { wikipediaUrl } from '../../../utils/format/wikipediaUrl';
import {
  cartesianToRaDecZ,
  formatRaSexagesimal,
  formatDecSexagesimal,
  iauName,
  iauRaDecSuffix,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyType,
  sdssExplorerUrl,
  sdssThumbnailUrl,
  dssThumbnailUrl,
  galaxyThumbnailFovArcmin,
  nedByNameUrl,
  nedNearPositionUrl,
  PC_TO_LY,
} from '../../../utils/math';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';

/**
 * DESI tracers whose .bin magnitudes are per-tracer synthetic display
 * constants, not measurements. The DESI LSS clustering catalogs ship no
 * fluxes for LRG/ELG/QSO; the build pipeline bakes a constant per tracer
 * purely so the renderer has a brightness to draw with. Only BGS carries
 * real (Legacy Surveys g/r/z) photometry.
 */
const DESI_NO_PHOTOMETRY_TRACERS: ReadonlySet<number> = new Set([
  DESI_TRACER_CLASS.LRG,
  DESI_TRACER_CLASS.ELG,
  DESI_TRACER_CLASS.QSO,
]);

export function buildGalaxyInfo(row: GalaxyRow): GalaxyInfo {
  const { x: px, y: py, z: pz, source } = row;
  const objID = BigInt(row.objId);

  const [ra, dec, fallbackRedshift] = cartesianToRaDecZ(px, py, pz);
  const redshift = Number.isFinite(row.redshift) ? row.redshift : fallbackRedshift;
  const distanceMpc = Math.sqrt(px * px + py * py + pz * pz);

  // NaN out the mag slots for tracers with no real photometry BEFORE any
  // derived quantity (colours, absoluteMagG, galaxyType) is computed, so a
  // synthetic constant can never masquerade as a measurement downstream.
  // The InfoCard renders `photometryNote` in place of the magnitude rows.
  //
  // The gate is PER-ROW, not per-source: it fires only for the fluxless
  // tracers (LRG/ELG/QSO), so a BGS row's REAL photometry is never suppressed.
  // The Sloan Great Wall patch is pure BGS by geometry, so this branch never
  // suppresses any SGW row — but it is listed alongside the cone/wedge so that a
  // stray non-BGS SGW row (if the selection ever caught one) would still be
  // caught by the classByte check rather than silently painting synthetic mags.
  const suppressPhotometry =
    (source === Source.DesiDeep || source === Source.DesiWedge || source === Source.DesiSgw) &&
    DESI_NO_PHOTOMETRY_TRACERS.has(row.classByte);
  const { magU, magG, magR, magI, magZ } = suppressPhotometry
    ? { magU: NaN, magG: NaN, magR: NaN, magI: NaN, magZ: NaN }
    : row;

  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(
      `buildGalaxyInfo: non-galaxy catalog source ${source} has no photometric bands`,
    );
  }
  const bands = entry.bandLabels;

  const candidatePairs: Array<[keyof typeof bands, keyof typeof bands, number]> = [
    ['u', 'g', magU - magG],
    ['g', 'r', magG - magR],
    ['r', 'i', magR - magI],
    ['i', 'z', magI - magZ],
  ];
  const colours: Array<{ label: string; value: number }> = [];
  for (const [a, b, value] of candidatePairs) {
    if (bands[a] === '—' || bands[b] === '—') continue;
    if (!Number.isFinite(value)) continue;
    colours.push({ label: `${bands[a]}−${bands[b]}`, value });
  }

  const isSdss = source === Source.SDSS;
  const famousEntry = row.famous;
  let primaryCatalogue: { label: string; href: string } | null;
  if (isSdss && objID > 0n) {
    primaryCatalogue = { label: 'SDSS Explorer', href: sdssExplorerUrl(objID) };
  } else if (source === Source.TwoMRS) {
    primaryCatalogue = { label: 'NED', href: nedNearPositionUrl(ra, dec) };
  } else if (source === Source.Glade) {
    primaryCatalogue = {
      label: 'NED',
      href: objID > 0n ? nedByNameUrl(`PGC ${objID}`) : nedNearPositionUrl(ra, dec),
    };
  } else if (famousEntry) {
    primaryCatalogue = { label: 'NED', href: nedByNameUrl(famousEntry.names[0]!) };
  } else if (source === Source.SDSS) {
    primaryCatalogue = { label: 'NED', href: nedNearPositionUrl(ra, dec) };
  } else {
    primaryCatalogue = null;
  }
  const catalogues: GalaxyInfo['catalogues'] = [];
  if (primaryCatalogue) catalogues.push(primaryCatalogue);
  if (famousEntry) {
    catalogues.push({
      label: 'Wikipedia',
      href: wikipediaUrl(famousWikipediaTitle([...famousEntry.names])),
    });
  }

  const fovArcmin = galaxyThumbnailFovArcmin(row.diameterKpc, distanceMpc);
  const surveyThumbnailUrl = isSdss
    ? sdssThumbnailUrl(ra, dec, 200, fovArcmin)
    : dssThumbnailUrl(ra, dec, fovArcmin);
  const thumbnailUrl = famousEntry
    ? `/images/famous-thumb/${famousEntry.id}.webp`
    : surveyThumbnailUrl;
  const thumbnailFallbackUrl = famousEntry ? surveyThumbnailUrl : undefined;

  const ar = row.axisRatio;
  const pa = row.positionAngleDeg;
  // Authoritative persisted flag (from cloud.orientationIsFallback via the
  // row), NOT a re-hash of position. The old detector recomputed
  // fallbackOrientation from the baked f32 (x,y,z) and compared floats for
  // exact equality — lossy through the cartesian→ra/dec→hash round-trip, so
  // ~10 % of true fallback rows read as "measured" here.
  const isFallback = row.orientationIsFallback;
  let provenance: string;
  if (isFallback) {
    provenance = 'deterministic fallback';
  } else if (source === Source.SDSS) {
    provenance = 'SDSS exp+deV blend';
  } else if (source === Source.TwoMRS) {
    provenance = '2MASS XSC sup_phi';
  } else if (source === Source.Glade) {
    provenance = 'HyperLEDA PGC';
  } else {
    provenance = 'deterministic fallback';
  }

  const dKpc = row.diameterKpc;
  // Authoritative persisted flag (from cloud.diameterIsFallback via the
  // row), not `dKpc === DEFAULT_GALAXY_DIAMETER_KPC`: a genuinely measured
  // 30 kpc galaxy would compare equal to the fallback constant and get
  // mislabeled — same rationale as the orientation-provenance fix above.
  let diameterProvenance: string;
  if (row.diameterIsFallback) {
    diameterProvenance = 'fallback (30 kpc)';
  } else if (source === Source.SDSS) {
    diameterProvenance = 'SDSS petroR50_r';
  } else if (source === Source.TwoMRS) {
    diameterProvenance = '2MRS Riso';
  } else if (source === Source.Glade) {
    diameterProvenance = 'GLADE Tully';
  } else {
    diameterProvenance = 'fallback (30 kpc)';
  }

  const agnClass = sourceClassLabel(source, row.classByte) ?? undefined;
  const parentSurveyPrefix = milliquasParentSurveyPrefix(row.parentSurveyByte);
  const milliquasDisplayName =
    source === Source.Milliquas && parentSurveyPrefix !== null
      ? `${parentSurveyPrefix} ${iauRaDecSuffix(ra, dec)}`
      : undefined;

  let famous: GalaxyInfo['famous'];
  if (famousEntry) {
    famous = {
      id: famousEntry.id,
      ...(famousEntry.commonName !== undefined ? { commonName: famousEntry.commonName } : {}),
      names: [...famousEntry.names],
      description: famousEntry.description,
      type: famousEntry.type,
    };
  }
  const morphology = famousEntry?.type ? formatMorphology(famousEntry.type) : undefined;

  // Blueshifted/zero-z Local Group members (peculiar velocity swamps the tiny
  // Hubble-flow term at these distances) would otherwise feed a negative
  // redshift into lookbackTimeGyr and yield negative lookback time; fall back
  // to distance, since light-travel time is ~equal to distance at this range.
  const lookbackGyr = redshift > 0 ? lookbackTimeGyr(redshift) : (distanceMpc * PC_TO_LY) / 1000;

  return {
    type: 'galaxyCatalog',
    index: row.index,
    objID,
    x: px,
    y: py,
    z: pz,
    ra,
    dec,
    raSexagesimal: formatRaSexagesimal(ra),
    decSexagesimal: formatDecSexagesimal(dec),
    redshift,
    distanceMpc,
    hubbleVelocityKmS: hubbleVelocityKmS(redshift),
    lookbackGyr,
    earthEra: earthEraForLookback(lookbackGyr),
    magU,
    magG,
    magR,
    magI,
    magZ,
    absoluteMagG: absoluteMagnitude(magG, distanceMpc),
    galaxyType: galaxyType(source, { magU, magG, magR, magI, magZ }),
    morphology,
    iauName: iauName(source, ra, dec),
    displayName:
      [
        famous ? famousDisplayName(famous) : undefined,
        milliquasDisplayName,
        (source === Source.TwoMRS || source === Source.Glade) && objID > 0n
          ? `PGC ${objID}`
          : undefined,
        iauName(source, ra, dec),
      ].find((c) => c !== undefined && c.length > 0) ?? iauName(source, ra, dec),
    bands,
    colours,
    source,
    sourceLabel: SOURCE_REGISTRY[source].label,
    agnClass,
    ...(suppressPhotometry ? { photometryNote: 'no photometry in source catalog' } : {}),
    catalogues,
    thumbnailUrl,
    ...(thumbnailFallbackUrl !== undefined ? { thumbnailFallbackUrl } : {}),
    diameterKpc: dKpc,
    diameterProvenance,
    orientation: { axisRatio: ar, positionAngleDeg: pa, provenance },
    famous,
  };
}
