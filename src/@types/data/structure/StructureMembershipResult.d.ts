/**
 * The return value of `structureMembership`. `packedIds` carries the
 * matched galaxies in catalog-array-order, then local-index order;
 * `count` is its length, exposed redundantly so callers (e.g. the
 * InfoCard "N member galaxies" text) don't have to read `.length`.
 */
export type StructureMembershipResult = {
  readonly count: number;
  readonly packedIds: readonly number[];
};
