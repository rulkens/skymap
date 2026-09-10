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

/**
 * `petunias` names the PRE-BAKED GLB, not the Sketchfab download: the source
 * carries 11 materials and `buildMeshes` refuses those. `meshes.petuniasSource`
 * stays registered so the provenance chain reaches the original.
 */
export const MESH_SOURCES: Readonly<Record<string, MeshSourceEntry>> = {
  whale: {
    native: 'meshes.whale',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0',
  },
  petunias: {
    native: 'meshes.petunias',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0',
  },
};
