/** Construction options for `createGalaxyAtlasSubsystem`. */
export type GalaxyAtlasDeps = {
  readonly device: GPUDevice;
  /**
   * Wake the engine's render loop for the next frame. Called when a
   * fetch completes (so the thumbnail can render) and when a fetch
   * fails (so the still-animating predicate re-checks `inFlightCount`).
   */
  readonly requestRender: () => void;
};
