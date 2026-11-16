/**
 * satellitesSlot — the catalog's asset slot. Its committed value is the file. Committing it starts
 * the SGP4 worker and releasing it terminates the worker and frees the GPU instances, so the demand
 * loop's load/release edges are the worker's whole lifetime: no worker exists while the Layer is
 * inactive.
 */
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { fetchLiveFile } from '../../../../services/loading/fetchLiveFile';
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { SatellitePointRenderer } from '../../points/@types/SatellitePointRenderer';
import type { SatellitePropagator } from '../../sweep/@types/SatellitePropagator';

export function createSatellitesSlot(
  propagator: SatellitePropagator,
  renderer: SatellitePointRenderer,
): AssetSlot<ArrayBuffer, void> {
  return createAssetSlot({
    name: 'satellites',
    fetch: (_req, signal, onProgress) =>
      fetchLiveFile('satellites', 'satellites.satg', signal, onProgress),
    commit: (file) => propagator.start(file),
    onRelease: () => {
      propagator.stop();
      renderer.clear();
    },
  });
}
