import type { TexturedMeshAsset } from '../../scene-workbench/@types/TexturedMeshAsset';

export type RepackAtlasReport = {
  readonly asset: TexturedMeshAsset;
  readonly sizePx: number;
  readonly scale: number;
  readonly chartCount: number;
  readonly orphanVertices: number;
  readonly orphanBlocks: number;
  readonly bytes: number;
  readonly sourceBytes: number;
};
