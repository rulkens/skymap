/**
 * The blackHoles Layer's whole runtime: the lens renderer. Non-null — `create`
 * builds it before returning, so the lens pass reads it without a null check.
 */

import type { SgrAStarLensingRenderer } from '../../../@types/rendering/SgrAStarLensingRenderer';

export type BlackHolesRuntime = { readonly lensRenderer: SgrAStarLensingRenderer };
