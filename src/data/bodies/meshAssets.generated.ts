// src/data/bodies/meshAssets.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-meshes
// Source of truth:  data/raw/meshes/**
import type { Vec3 } from '../../@types/math/Vec3';
import type { ContactDecal } from '../../@types/data/mesh/ContactDecal';
import type { MeshTextureField } from '../../@types/data/mesh/MeshTextureField';
import type { Tier } from '../../@types/data/Tier';

export type MeshAssetRow = {
  readonly key: string;
  /** The highest tier this body ships; `meshBodyRow.req` clamps to it. */
  readonly tierCeiling: Tier;
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
  /** The ground-contact box `contactShadow` projects into, body frame,
   *  metres; absent for a floating mesh. */
  readonly contactDecal?: ContactDecal;
};

export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>> = {
  whale: {
    key: 'whale',
    tierCeiling: 'small',
    boundingRadiusM: 7.236827809308258,
    groundOffsetM: 2.135997295379639,
    meanAlbedo: [0.099099, 0.093083, 0.087187],
    triangleCount: 5598,
    substituted: [],
    source: 'https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0',
  },
  petunias: {
    key: 'petunias',
    tierCeiling: 'small',
    boundingRadiusM: 0.4978227272024157,
    groundOffsetM: 0.26998705849627713,
    meanAlbedo: [0.184625, 0.20743, 0.132015],
    triangleCount: 222249,
    substituted: [],
    source: 'https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0',
  },
  voyager: {
    key: 'voyager',
    tierCeiling: 'small',
    boundingRadiusM: 14.544853697326353,
    groundOffsetM: 4.791086139044178,
    meanAlbedo: [0.104209, 0.100278, 0.094753],
    triangleCount: 20378,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/voyager-probe-b/',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA / Michael D. Carbajal (NASA Headquarters), "Voyager Probe (B)" (https://science.nasa.gov/3d-resources/voyager-probe-b/)',
  },
  hubble: {
    key: 'hubble',
    tierCeiling: 'small',
    boundingRadiusM: 8.786712680737544,
    groundOffsetM: 6.5379468441961155,
    meanAlbedo: [0.154997, 0.143332, 0.12433],
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
    tierCeiling: 'small',
    boundingRadiusM: 1.9901394895098548,
    groundOffsetM: 0.9143134790374972,
    meanAlbedo: [0.260541, 0.252103, 0.246785],
    triangleCount: 199482,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/',
    licence: 'Public domain (NASA)',
    attribution:
      'Brian Kumanchik, NASA/JPL-Caltech, "Mars 2020 Perseverance Rover" (https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/)',
    contactDecal: {
      centre: [-0.14952298327985314, -0.005148384292582237, -0.9143134790374972],
      halfU: [0, 2.331205129623413, 0],
      halfV: [-2.331205129623413, 0, 0],
    },
  },
  curiosity: {
    key: 'curiosity',
    tierCeiling: 'small',
    boundingRadiusM: 2.4789837008600912,
    groundOffsetM: 0.8980751162248013,
    meanAlbedo: [0.170078, 0.166912, 0.163265],
    triangleCount: 48384,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/curiosity-rover-msl/',
    licence: 'Public domain (NASA)',
    attribution:
      'Brian Kumanchik, NASA/JPL-Caltech, "Curiosity Rover (MSL) (Clean)" (https://science.nasa.gov/3d-resources/curiosity-rover-msl/)',
    contactDecal: {
      centre: [0.23637191809611996, -0.026815513198097236, -0.8980751758294461],
      halfU: [0, 2.9585468769073486, 0],
      halfV: [-2.9585468769073486, 0, 0],
    },
  },
  mer: {
    key: 'mer',
    tierCeiling: 'small',
    boundingRadiusM: 1.2008228521056163,
    groundOffsetM: 0.574356440144803,
    meanAlbedo: [0.167542, 0.140955, 0.10138],
    triangleCount: 32562,
    substituted: [],
    source: 'https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/',
    licence: 'Public domain (NASA)',
    attribution:
      'NASA/JPL-Caltech, "Mars Exploration Rover - Spirit and Opportunity" (https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/)',
    contactDecal: {
      centre: [-0.07798823068739452, -0.01337763976239624, -0.5743564252436418],
      halfU: [0, 1.709266185760498, 0],
      halfV: [-1.709266185760498, 0, 0],
    },
  },
};
