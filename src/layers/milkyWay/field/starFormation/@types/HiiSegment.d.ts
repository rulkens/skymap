/**
 * HiiSegment — one contiguous instance range of `model.hiiComps` (`first`/
 * `count` in RECORDS, not bytes): the `instanceCount`/`firstInstance` bounds
 * `createGalaxyFieldRenderer`'s encode pass hands to each `HII_TIERS` row's
 * own draw call, and what `buildHiiRegionsWithSegments` labels its tiers with.
 */
export type HiiSegment = {
  readonly label: string;
  readonly first: number;
  readonly count: number;
};
