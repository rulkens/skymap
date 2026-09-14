import type { GalaxyIsmMapGridRadius } from '../../services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';

export type GalaxyFieldRendererDeps = {
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  /**
   * The two hooks the CPU readback path keeps on the host side (its queue and
   * decoders are host-owned — see the spec's tool-only table). Each fires from
   * the one place inside this module that knows the copy just went stale.
   */
  readonly onIsmMapRebuilt?: (grid: GalaxyIsmMapGridRadius) => void;
  readonly onOrientationRebuilt?: (grid: GalaxyIsmMapGridRadius) => void;
};
