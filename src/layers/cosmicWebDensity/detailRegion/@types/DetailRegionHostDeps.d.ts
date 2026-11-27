import type { DetailRegionDeps } from './DetailRegionDeps';

/** What the host shares with every region it builds; it fills in the per-field rest. */
export type DetailRegionHostDeps = Omit<DetailRegionDeps, 'id' | 'binBaseName' | 'bricksPerAxis'>;
