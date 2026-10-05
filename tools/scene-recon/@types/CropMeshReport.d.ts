import type { TexturedMeshAsset } from '../../scene-workbench/@types/TexturedMeshAsset';

export type CropMeshReport = {
  readonly asset: TexturedMeshAsset;
  readonly sourceTriangles: number;
  /** Fraction 0..1 of the atlas the kept UV triangles cover. */
  readonly uvCoverage: number;
};
