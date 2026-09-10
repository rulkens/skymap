/**
 * meshSources — one row per baked mesh body: the raw GLB it comes from and the
 * credit its licence obliges. `buildMeshes` derives its work list from here and
 * copies both onto the generated `MeshAssetRow` that the credit surface reads,
 * so a row that skipped them would silently ship an uncredited CC BY asset.
 * `source` is not repeated — it is `RAW_DATA[native].upstream`.
 */

import type { RawDataKey } from './rawDataRegistry';

export type MeshSourceEntry = {
  readonly native: RawDataKey;
  readonly licence: string;
  /** Author + profile URL; empty string for CC0. */
  readonly attribution: string;
};

/** Empty until the real assets clear their provenance gate. */
export const MESH_SOURCES: Readonly<Record<string, MeshSourceEntry>> = {};
