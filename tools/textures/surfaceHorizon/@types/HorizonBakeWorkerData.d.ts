/** HorizonBakeWorkerData — what a bake worker needs to open the height archives and write tiles. */
export type HorizonBakeWorkerData = {
  /** `public/data/images`; tile paths and archives hang off it. */
  readonly imagesDir: string;
  readonly prefix: string;
  readonly radiusM: number;
};
