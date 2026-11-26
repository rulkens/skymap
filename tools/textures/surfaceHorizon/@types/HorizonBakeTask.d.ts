/** HorizonBakeTask — one tile for a bake worker, which replies with the `HorizonTile` kind it wrote. */
export type HorizonBakeTask = { readonly z: number; readonly x: number; readonly y: number };
