import type { SurfaceTilePlan } from '../../@types/SurfaceTilePlan';

/** The plan that draws, fetches and changes nothing: the frame before the
 *  planner first runs, and the planner's own base when no body is in reach. */
export const IDLE_SURFACE_TILE_PLAN: SurfaceTilePlan = {
  cut: [],
  touched: [],
  requests: [],
  wantManifest: null,
  verdict: 'keep',
  lastPlan: null,
  params: null,
  awake: false,
};
