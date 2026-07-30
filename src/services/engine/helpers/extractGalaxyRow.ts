/**
 * extractGalaxyRow — the cloud-reading half of the old galaxyInfoBuilder.
 *
 * Reads the raw per-galaxy slots at `idx` off the CPU cloud mirror into a flat,
 * serializable `GalaxyRow`. This is the only engine-side step in the selection
 * read path; everything downstream (`buildGalaxyInfo`) is pure formatting that
 * runs React-side. The bounds + missing-cloud guards are the tier-swap race
 * defence: an index that no longer fits a just-shrunk cloud resolves to null
 * rather than reading past the typed array.
 *
 * The catalog `objID` (a bigint, SDSS ids exceed 2^53) is stringified here so
 * the row stays JSON-serializable for the RTK slice; `buildGalaxyInfo` parses
 * it back with `BigInt(...)` where it needs the numeric identity.
 */
import { Source } from '../../../data/sources';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';

export function extractGalaxyRow(
  cloud: GalaxyCatalog | undefined,
  idx: number,
  source: GalaxyCatalogSourceType,
  famousGalaxiesMeta?: readonly FamousGalaxyMetaEntry[],
): GalaxyRow | null {
  if (!cloud) return null;
  if (idx < 0 || idx >= cloud.count) return null;

  const famousEntry =
    source === Source.FamousGalaxy && famousGalaxiesMeta ? famousGalaxiesMeta[idx] : undefined;
  const famous = famousEntry
    ? {
        id: famousEntry.id,
        ...(famousEntry.commonName !== undefined ? { commonName: famousEntry.commonName } : {}),
        names: famousEntry.names,
        description: famousEntry.description,
        type: famousEntry.type,
      }
    : undefined;

  return {
    type: 'galaxyCatalog',
    source,
    index: idx,
    objId: cloud.objIDs[idx]!.toString(),
    x: cloud.positions[idx * 3 + 0]!,
    y: cloud.positions[idx * 3 + 1]!,
    z: cloud.positions[idx * 3 + 2]!,
    redshift: cloud.spectroscopicZ[idx]!,
    magU: cloud.magU[idx]!,
    magG: cloud.magG[idx]!,
    magR: cloud.magR[idx]!,
    magI: cloud.magI[idx]!,
    magZ: cloud.magZ[idx]!,
    diameterKpc: cloud.diameterKpc[idx]!,
    axisRatio: cloud.axisRatio[idx]!,
    positionAngleDeg: cloud.positionAngleDeg[idx]!,
    orientationIsFallback: cloud.orientationIsFallback[idx] === 1,
    diameterIsFallback: cloud.diameterIsFallback[idx] === 1,
    classByte: cloud.classByte[idx]!,
    parentSurveyByte: cloud.parentSurveyByte[idx]!,
    ...(famous ? { famous } : {}),
  };
}
