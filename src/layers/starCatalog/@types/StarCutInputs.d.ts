/**
 * What the Layer's planner hands the GPU cut and the draws that read it: the
 * cut's inputs plus the shade scalars the cut does not read.
 */

import type { OctreeCutInputs } from '../../../@types/octree/OctreeCutInputs';
import type { OctreeCutSourceInput } from '../../../@types/octree/OctreeCutSourceInput';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';

// The octree cut is generic over `SourceType`; this Layer's cut only ever carries its own codes.
export type StarCutInputs = OctreeCutInputs & {
  readonly cut: {
    readonly sources: readonly (OctreeCutSourceInput & {
      readonly source: StarCatalogSourceType;
    })[];
  };
  readonly sizePx: number;
  readonly brightness: number;
  readonly glowOverlap: number;
  readonly aggregateIntensityCap: number;
};
