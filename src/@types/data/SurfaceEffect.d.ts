/**
 * SurfaceEffect — one fragment-shading feature a `SurfaceTileSpec` row can
 * list. Task 6 keys the tile shader variant off a row's `effects` set, so
 * this union is also the closed set of inputs `SurfaceEffectInputs` can name.
 */
export type SurfaceEffect = 'materialMap' | 'nightLights' | 'cloudShadows';
