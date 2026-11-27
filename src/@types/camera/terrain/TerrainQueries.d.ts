import type { TerrainHeightAtLookup } from './TerrainHeightAtLookup';
import type { TerrainHorizonLookup } from './TerrainHorizonLookup';

/** What a composition's one terrain provider answers about the ground; `Layer.terrain`'s shape. */
export type TerrainQueries = {
  readonly heightAt: TerrainHeightAtLookup;
  readonly horizonAt: TerrainHorizonLookup;
};
