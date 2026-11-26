/** Which pyramid to load and its finest level, the texture's mip 0. */
export type VolumePyramidRequest = {
  readonly binBaseName: string;
  readonly baseLevel: 1 | 2;
};
