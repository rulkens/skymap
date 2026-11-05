export type TextureAtlasConfig = {
  /** Side length, in pixels, of the square atlas texture. */
  readonly atlasSide: number;
  /** Side length, in pixels, of each square slot within the atlas. */
  readonly slotSide: number;
  /** Pixel format of the underlying GPUTexture. */
  readonly format: GPUTextureFormat;
  /**
   * GPU debug label for this atlas, e.g. `'galaxy-atlas'`. Surfaces in
   * devtools and validation errors, which matters once more than one atlas
   * is live at once — a hardcoded label would misattribute every other
   * consumer's texture. The texture view derives `${label}-view` from this.
   */
  readonly label: string;
};
