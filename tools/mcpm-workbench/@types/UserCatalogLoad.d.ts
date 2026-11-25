import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { UserCatalog } from './UserCatalog';

/**
 * UserCatalogLoad — what Load in the import dialog hands the store: the parsed
 * file, and the bounds Auto fit fits the Selection box to (padding not yet
 * added; null leaves the box as it is).
 */
export type UserCatalogLoad = {
  readonly catalog: UserCatalog;
  readonly fitBounds: { readonly min: Vec3; readonly max: Vec3 } | null;
};
