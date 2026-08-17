/**
 * AtlasTileRect — the pixel-space region one tile occupies inside an atlas
 * bitmap, in UNFLIPPED source coordinates (origin at the image's top-left, the
 * frame `copyExternalImageToTexture`'s `origin` is expressed in).
 *
 * It is a rect rather than a bare tile index because the consumer is a crop:
 * `setPlaceholderMap` hands `{x, y}` to the copy's source `origin` and `{w, h}`
 * to its copy size. The producer side is free to derive the rect however it
 * likes — today `atlasTileRect` derives it from a uniform grid — without the
 * renderer contract having to learn the grid.
 */

export type AtlasTileRect = { x: number; y: number; w: number; h: number };
