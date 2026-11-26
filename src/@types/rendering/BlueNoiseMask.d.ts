/** The density march's blue-noise jitter mask: a texture that exists at once, filled later. */
export type BlueNoiseMask = {
  /** Exists from construction (bind groups may reference it); zero until `ready` resolves. */
  readonly texture: GPUTexture;
  /** Resolves once the bytes are written (or dropped after `destroy`); rejects on a failed fetch. */
  readonly ready: Promise<void>;
  /** Frees the texture; bytes landing afterwards are dropped, not written. */
  destroy(): void;
};
