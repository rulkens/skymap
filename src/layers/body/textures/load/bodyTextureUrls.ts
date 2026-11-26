import type { BodyTextureReq } from '../@types/BodyTextureReq';
import { LIVE_DATASETS } from '../../../../data/live/liveDatasets';
import { dataUrl } from '../../../../services/loading/fetchWithProgress';
import { resolveLiveFileUrl } from '../../../../services/loading/resolveLiveFileUrl';
import { bodyTextureFilename } from '../../../../utils/bodyTextures/bodyTextureFilename';

/**
 * Where a body texture can come from, best first: a slot a live dataset feeds tries that dataset's
 * newest file (resolved through its pointer) before the built-in tier. Both share one file name.
 */
export function bodyTextureUrls(
  req: BodyTextureReq,
  signal: AbortSignal,
): readonly (() => Promise<string>)[] {
  const name = bodyTextureFilename(req.bodyId, req.kind, req.tier);
  const builtIn = (): Promise<string> => Promise.resolve(dataUrl(`images/textures/${name}`));
  const live = LIVE_DATASETS.find(
    ({ bodyTexture }) => bodyTexture?.bodyId === req.bodyId && bodyTexture.kind === req.kind,
  );
  return live ? [() => resolveLiveFileUrl(live.id, name, signal), builtIn] : [builtIn];
}
