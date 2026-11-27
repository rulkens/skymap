import type { DetailRegion } from './DetailRegion';

/** A host's live region and the K (bricks per axis) it was built for: a new K means a new region. */
export type HostedDetailRegion = { readonly region: DetailRegion; readonly k: number };
