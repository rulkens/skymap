/**
 * HiiSegment — one contiguous instance range of the renderer's `hiiComps`
 * (`first`/`count` in RECORDS, not bytes): the `instanceCount`/`firstInstance`
 * bounds `createGalaxyFieldRenderer`'s encode hands to each HII target's draw, and what `buildHiiRegionsWithSegments` labels its tiers with.
 */
export type HiiSegment = {
  readonly label: string;
  readonly first: number;
  readonly count: number;
};
