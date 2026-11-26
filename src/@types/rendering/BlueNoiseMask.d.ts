/** The density march's blue-noise jitter mask: a texture that exists at once, filled later. */
export type BlueNoiseMask = {
  /** Exists from construction (bind groups may reference it); zero until `ready` resolves. */
  readonly texture: GPUTexture;
  /** Resolves once the bytes are written; rejects on a failed fetch. */
  readonly ready: Promise<void>;
};
