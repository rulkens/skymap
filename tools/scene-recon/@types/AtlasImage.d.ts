/** Interleaved RGB, row-major, `sizePx²` texels — sharp's `.raw()` layout at 3 channels. */
export type AtlasImage = { readonly sizePx: number; readonly rgb: Uint8Array };
