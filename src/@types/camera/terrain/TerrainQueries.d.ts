import type { TerrainHeightAtLookup } from './TerrainHeightAtLookup';

/** What a composition's one terrain provider answers about the ground; `Layer.terrain`'s shape. */
export type TerrainQueries = { readonly heightAt: TerrainHeightAtLookup };
