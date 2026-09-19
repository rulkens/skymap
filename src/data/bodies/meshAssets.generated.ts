// src/data/bodies/meshAssets.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-meshes
// Source of truth:  data/raw/meshes/**
import type { Vec3 } from '../../@types/math/Vec3';
import type { MeshTextureField } from '../../@types/data/mesh/MeshTextureField';

export type MeshAssetRow = {
  readonly key: string;
  readonly path: string;
  readonly boundingRadiusM: number;
  /** How far the lowest vertex sits BELOW the origin along the body frame's −Z,
   *  metres, ≥ 0. A surface-locked body is lifted by this so it rests on the
   *  host's sphere; meaningless (but harmless) for a free-flying one. */
  readonly groundOffsetM: number;
  readonly meanAlbedo: Vec3;
  readonly triangleCount: number;
  /** Slots `buildMeshes` filled with a 1×1 constant because the source had no map. */
  readonly substituted: readonly MeshTextureField[];
  readonly source: string;
  readonly licence: string;
  /** author + URL; empty string for CC0 */
  readonly attribution: string;
};

export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>> = {
  whale: {
    key: 'whale',
    path: 'meshes/whale.mesh',
    boundingRadiusM: 7.236827809308258,
    groundOffsetM: 2.135997295379639,
    meanAlbedo: [0.09916, 0.092641, 0.087149],
    triangleCount: 5598,
    substituted: [],
    source: 'https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0',
  },
  petunias: {
    key: 'petunias',
    path: 'meshes/petunias.mesh',
    boundingRadiusM: 0.4978227272024157,
    groundOffsetM: 0.26998705849627713,
    meanAlbedo: [0.184192, 0.20776, 0.130303],
    triangleCount: 222249,
    substituted: [],
    source: 'https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0',
  },
  voyager: {
    key: 'voyager',
    path: 'meshes/voyager.mesh',
    boundingRadiusM: 14.544853697326353,
    groundOffsetM: 4.791086139044178,
    meanAlbedo: [0.098529, 0.094666, 0.089745],
    triangleCount: 20378,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/voyager-probe-b/',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA / Michael D. Carbajal (NASA Headquarters), "Voyager Probe (B)" (https://science.nasa.gov/3d-resources/voyager-probe-b/)',
  },
  hubble: {
    key: 'hubble',
    path: 'meshes/hubble.mesh',
    boundingRadiusM: 8.786712680737544,
    groundOffsetM: 6.5379468441961155,
    meanAlbedo: [0.168474, 0.155995, 0.134209],
    triangleCount: 7672,
    substituted: [],
    source:
      'https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Hubble%20Space%20Telescope%20(A)',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA, "Hubble Space Telescope (A)" — NASA 3D Resources (https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Hubble%20Space%20Telescope%20(A))',
  },
  perseverance: {
    key: 'perseverance',
    path: 'meshes/perseverance.mesh',
    boundingRadiusM: 1.9901394895098548,
    groundOffsetM: 0.9143134790374972,
    meanAlbedo: [0.25973, 0.251583, 0.246039],
    triangleCount: 199482,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/',
    licence: 'Public domain (NASA)',
    attribution:
      'Brian Kumanchik, NASA/JPL-Caltech, "Mars 2020 Perseverance Rover" (https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/)',
  },
  curiosity: {
    key: 'curiosity',
    path: 'meshes/curiosity.mesh',
    boundingRadiusM: 2.4789837008600912,
    groundOffsetM: 0.8980751162248013,
    meanAlbedo: [0.169979, 0.166527, 0.16356],
    triangleCount: 48384,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/curiosity-rover-msl/',
    licence: 'Public domain (NASA)',
    attribution:
      'Brian Kumanchik, NASA/JPL-Caltech, "Curiosity Rover (MSL) (Clean)" (https://science.nasa.gov/3d-resources/curiosity-rover-msl/)',
  },
  mer: {
    key: 'mer',
    path: 'meshes/mer.mesh',
    boundingRadiusM: 1.2008228521056163,
    groundOffsetM: 0.574356440144803,
    meanAlbedo: [0.16812, 0.140585, 0.100566],
    triangleCount: 32562,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA/JPL-Caltech, "Mars Exploration Rover - Spirit and Opportunity" (https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/)',
  },
};
