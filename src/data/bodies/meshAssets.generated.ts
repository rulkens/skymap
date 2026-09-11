// src/data/bodies/meshAssets.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-meshes
// Source of truth:  data/raw/meshes/**
import type { Vec3 } from '../../@types/math/Vec3';

export type MeshAssetRow = {
  readonly key: string;
  readonly path: string;
  readonly boundingRadiusM: number;
  readonly meanAlbedo: Vec3;
  readonly triangleCount: number;
  readonly normalMapSubstituted: boolean;
  readonly source: string;
  readonly licence: string;
  readonly attribution: string; // author + URL; empty string for CC0
};

export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>> = {
  whale: {
    key: 'whale',
    path: 'meshes/whale.mesh',
    boundingRadiusM: 6.77349779893339,
    meanAlbedo: [0.09916, 0.092641, 0.087149],
    triangleCount: 5598,
    normalMapSubstituted: false,
    source: 'https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0',
  },
  petunias: {
    key: 'petunias',
    path: 'meshes/petunias.mesh',
    boundingRadiusM: 0.4610371216917222,
    meanAlbedo: [0.094601, 0.106771, 0.066824],
    triangleCount: 150000,
    normalMapSubstituted: true,
    source: 'https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0',
    licence: 'CC BY 4.0',
    attribution:
      'This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0',
  },
};
