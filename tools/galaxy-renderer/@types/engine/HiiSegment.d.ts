/**
 * HiiSegment — one contiguous instance range of `model.hiiComps`
 * (`first`/`count` in RECORDS, not bytes): the `instanceCount`/`firstInstance`
 * bounds `createGalaxyEngine.ts`'s `drawFrame` passes straight to each
 * `HII_TIERS` row's own draw call, a per-frame rendering input — see that
 * file's own doc (the per-tier pass loop) for why the draw runs
 * unconditionally and only its timing slot is gated on `timing.enabled`.
 * Structurally the same shape `hiiRegions.ts`'s own `HiiRegionSegment`
 * returns — no import between the two, since one lives in shared `src/` and
 * the other is this tool's own type.
 */
export type HiiSegment = {
  readonly label: string;
  readonly first: number;
  readonly count: number;
};
