/**
 * meshSources — one row per baked mesh body: the raw GLB it comes from and the
 * credit its licence obliges. `buildMeshes` derives its work list from here and
 * copies both onto the generated `MeshAssetRow` that the credit surface reads,
 * so a row that skipped them would silently ship an uncredited CC BY asset.
 * `source` is not repeated — it is `RAW_DATA[native].upstream`.
 */

import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { RawDataKey } from './rawDataRegistry';

export type MeshSourceEntry = {
  readonly native: RawDataKey;
  readonly licence: string;
  /** Author + profile URL; empty string for CC0. */
  readonly attribution: string;
  /**
   * Source frame → body frame, column-major and a PROPER rotation (det +1): a
   * mirror turns the model inside out. Absent = already authored in the body
   * frame, which is the frame `rotationElements.ts` aims.
   */
  readonly bodyFromSource?: Mat3;
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
    // Modelled nose +Z, dorsal +Y (checked by rendering the source down all six
    // axes); the body frame wants nose +X, dorsal -Y, and det +1 then forces the
    // third column — the whale's left flank onto +Z, the orbit normal.
    bodyFromSource: [0, 0, 1, 0, -1, 0, 1, 0, 0],
  },
  petunias: {
    native: 'meshes.petunias',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0',
  },
  voyager: {
    native: 'meshes.voyager',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA / Michael D. Carbajal (NASA Headquarters), "Voyager Probe (B)" (https://science.nasa.gov/3d-resources/voyager-probe-b/)',
    // Modelled dish axis +Y, magnetometer boom +Z; the body frame wants the
    // antenna boresight on +X and reference up on +Z, so +X → -Y closes det +1.
    bodyFromSource: [0, -1, 0, 1, 0, 0, 0, 0, 1],
  },
  perseverance: {
    native: 'meshes.perseverance',
    licence: 'Public domain (NASA)',
    attribution:
      'Brian Kumanchik, NASA/JPL-Caltech, "Mars 2020 Perseverance Rover" (https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/)',
    // Modelled up +Y, forward +Z; the body frame wants up +Z, forward +X, so
    // the three axes cycle X→Y→Z→X — a rotation, det +1.
    bodyFromSource: [0, 1, 0, 0, 0, 1, 1, 0, 0],
  },
  curiosity: {
    native: 'meshes.curiosity',
    licence: 'Public domain (NASA)',
    attribution:
      'Brian Kumanchik, NASA/JPL-Caltech, "Curiosity Rover (MSL) (Clean)" (https://science.nasa.gov/3d-resources/curiosity-rover-msl/)',
    // Same source orientation as perseverance: up +Y → +Z, forward +Z → +X.
    bodyFromSource: [0, 1, 0, 0, 0, 1, 1, 0, 0],
  },
  mer: {
    native: 'meshes.mer',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA/JPL-Caltech, "Mars Exploration Rover - Spirit and Opportunity" (https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/)',
    // Same source orientation as perseverance: up +Y → +Z, forward +Z → +X.
    bodyFromSource: [0, 1, 0, 0, 0, 1, 1, 0, 0],
  },
};
