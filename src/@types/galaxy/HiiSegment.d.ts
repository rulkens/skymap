/**
 * HiiSegment — one contiguous instance range of `model.hiiComps` (`first`/
 * `count` in RECORDS, not bytes): the `instanceCount`/`firstInstance` bounds
 * `createGalaxyFieldRenderer`'s encode pass hands to each `HII_TIERS` row's
 * own draw call. Structurally the same shape as `hiiRegions.ts`'s own
 * `HiiRegionSegment`, but no import between the two — one lives in shared
 * `src/`, the other is this tool's own type.
 */
export type HiiSegment = {
  readonly label: string;
  readonly first: number;
  readonly count: number;
};
