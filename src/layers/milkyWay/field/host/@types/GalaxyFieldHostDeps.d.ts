import type { FieldTargetId } from '../../@types/FieldTargetId';
import type { GalaxyIsmMapGridRadius } from '../../ismMap/@types/GalaxyIsmMapGridRadius';

export type GalaxyFieldHostDeps = {
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  /** The targets the caller allocates, in `FIELD_TARGET_IDS` order; the plan lists no other. */
  readonly targetIds: readonly FieldTargetId[];
  /** The ISM readback landed (and with it `invMeanNorm`). The app: requestRender; the tool: its seeding-mean recompute. */
  readonly onIsmMapLanded: () => void;
  /** Tool diagnostics: the orientation field was rebuilt over `grid`. */
  readonly onOrientationRebuilt?: (grid: GalaxyIsmMapGridRadius) => void;
};
