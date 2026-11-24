import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

/** A planet a trail can be drawn around, and how far from it (km) that frame takes over. */
export type TrailCentre = { readonly id: SceneBodyId; readonly reachKm: number };
