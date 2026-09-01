/**
 * WorkbenchSagaContext — the engine-side capabilities a saga reaches for via
 * `getContext`, mirroring `src/store/types.ts`'s `SagaContext` at workbench
 * scale. `canvas` is the one capability wired so far; Task 4 adds `resources`
 * (a `RenderResources` bag) once that type exists.
 */
export type WorkbenchSagaContext = {
  canvas: HTMLCanvasElement;
};
