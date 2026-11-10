import type { GalaxyIsmMapGridRadius } from '../../ismMap/@types/GalaxyIsmMapGridRadius';

export type GalaxyFieldHostDeps = {
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  /** The ISM readback landed (and with it `invMeanNorm`). The app: requestRender; the tool: its seeding-mean recompute. */
  readonly onIsmMapLanded: () => void;
  /** Tool diagnostics: the orientation field was rebuilt over `grid`. */
  readonly onOrientationRebuilt?: (grid: GalaxyIsmMapGridRadius) => void;
};
