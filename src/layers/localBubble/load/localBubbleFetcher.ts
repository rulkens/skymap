/**
 * localBubbleFetcher — Fetcher<ShellMesh, void>. One file, tier-agnostic:
 * the `.shell` mesh is baked once at a fixed triangle budget, not per-tier
 * like the point catalogs.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { ShellMesh } from '../../../@types/data/shellMesh/ShellMesh';
import { decodeShellMesh } from '../../../data/shellMesh/shellMeshFormat';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';

const LOCAL_BUBBLE_PATH = 'local-bubble/v1/local-bubble.shell';

export const localBubbleFetcher: Fetcher<ShellMesh, void> = async (_req, signal, onProgress) => {
  const buf = await fetchWithProgress(dataUrl(LOCAL_BUBBLE_PATH), signal, onProgress);
  return decodeShellMesh(buf);
};
