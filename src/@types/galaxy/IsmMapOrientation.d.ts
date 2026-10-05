import type { GalaxyIsmMapGridRadius } from './GalaxyIsmMapGridRadius';

export type IsmMapOrientation = {
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  /** Run the six passes over the current source texture. The caller gates this; it does not gate itself. */
  dispatch(input: {
    readonly grid: GalaxyIsmMapGridRadius;
    readonly sigmaDerivTexels: number;
    readonly sigmaIntegTexels: number;
    /** `ismMapOrientationField.wesl`'s pedestal-subtraction inputs — see `IsmMapOrientationPedestal` there. `gasFloor: 1` collapses `gasProfile` to a flat pedestal (the blank-map case, generator off); `gasScaleLength` is then unused algebraically but must stay finite (the shader still evaluates `exp(-r/gasScaleLength)` before the zero multiply). */
    readonly gasFloor: number;
    readonly gasScaleLength: number;
    /** The ambient dust pedestal the generator seeds at step 0 — `ISM_MAP_AMBIENT_DUST` (`ismMapAmbientDust.ts`), passed live rather than baked in so the shader carries no restated constant. */
    readonly ambient: number;
  }): void;
  dispose(): void;
};
