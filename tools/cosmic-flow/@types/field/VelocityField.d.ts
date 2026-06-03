/**
 * VelocityField — the loaded CF4++ peculiar-velocity field as GPU resources.
 *
 * The GPU-side handle every visualization samples: an `rgba16float` 3D texture
 * (C-order `[z][y][x]`, `rgb` = velocity km/s, `a` = overdensity δ) over the
 * 128³ / 1 Gpc/h box, plus a shared linear sampler and the scalar metadata.
 * The engine loads it ONCE and shares it via `EngineContext.field`; layers
 * never fetch or upload it themselves.
 *
 * The factory that produces this lives in `src/field/createVelocityField.ts`
 * (runtime code); this file is only the shape.
 */
import type { VelocityFieldMeta } from './VelocityFieldMeta';

export type VelocityField = {
  /** rgba16float 3D texture view: rgb = velocity (km/s), a = overdensity δ. */
  readonly textureView: GPUTextureView;
  /** Linear-filtering sampler shared by every layer that reads the field. */
  readonly sampler: GPUSampler;
  readonly meta: VelocityFieldMeta;
  dispose(): void;
};
