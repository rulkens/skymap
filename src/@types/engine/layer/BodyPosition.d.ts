import type { SurfaceFixedSite } from '../../scene/SurfaceFixedSite';

/** Later variants (`orbit`, `sampled`, `anchor`) arrive with the first row that needs them. */
export type BodyPosition = { readonly kind: 'site'; readonly site: SurfaceFixedSite };
