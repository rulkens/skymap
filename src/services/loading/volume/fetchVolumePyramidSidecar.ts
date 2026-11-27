import type { VolumePyramidSidecar } from '../../../@types/data/volume/VolumePyramidSidecar';
import { VOLUME_PYRAMID_DATA_PREFIX } from '../../../data/volume/volumePyramidDataPrefix';
import {
  dataUrl,
  HttpError,
} from '../../../../packages/shared/src/services/loading/fetchWithProgress';

/** A pyramid's sidecar, read by the base load and again by its detail region (an HTTP-cache hit). */
export async function fetchVolumePyramidSidecar(
  binBaseName: string,
  signal: AbortSignal,
): Promise<VolumePyramidSidecar> {
  const url = dataUrl(`${VOLUME_PYRAMID_DATA_PREFIX}/${binBaseName}.json`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as VolumePyramidSidecar;
}
