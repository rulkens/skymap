/** Grid extent; sizes the ismMap textures. Every WGSL pass reads its own texture's `textureDimensions`, so there's no mirrored copy to drift. */
export const ISM_MAP_AZ = 1536;
