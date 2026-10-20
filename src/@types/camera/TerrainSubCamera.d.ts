import type { LonLatDeg } from '../scene/LonLatDeg';

export type TerrainSubCamera = LonLatDeg & { readonly coveredMaxLevel: number | null };
