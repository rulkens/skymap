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

export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>> = {};
