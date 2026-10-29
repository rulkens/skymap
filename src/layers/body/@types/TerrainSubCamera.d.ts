import type { LonLatDeg } from '../../../@types/scene/LonLatDeg';

export type TerrainSubCamera = LonLatDeg & { readonly coveredMaxLevel: number | null };
