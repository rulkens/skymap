/** satelliteProfileCodes — every catalog object's profile code, one byte each, in catalog order. */
import { satelliteProfileCode } from './satelliteProfileCode';
import type { SatelliteCatalog } from '../../catalog/@types/SatelliteCatalog';

export function satelliteProfileCodes(catalog: SatelliteCatalog): Uint8Array {
  const count = catalog.noradId.length;
  const codes = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    codes[k] = satelliteProfileCode({
      name: catalog.names[k] ?? '',
      cosparId: catalog.cosparIds[k] ?? '',
      classCode: catalog.classCode[k] ?? 0,
      meanMotion: catalog.meanMotion[k] ?? 0,
      eccentricity: catalog.eccentricity[k] ?? 0,
    });
  }
  return codes;
}
