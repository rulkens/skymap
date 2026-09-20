import type { ProceduralDiskInstance } from '../../../rendering/ProceduralDiskInstance';

export type ProceduralDiskFrameOutput = {
  /** Back-to-front sorted; consumer ships this array directly to the renderer. */
  readonly instances: readonly ProceduralDiskInstance[];
};
