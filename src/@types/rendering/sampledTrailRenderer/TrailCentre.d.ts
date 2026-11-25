import type { SceneBodyId } from '../../scene/SceneBodyId';

/** A planet a trail can be drawn around, and how far from it (km) that frame takes over. */
export type TrailCentre = { readonly id: SceneBodyId; readonly reachKm: number };
