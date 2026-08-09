/**
 * HiiSegment — one contiguous instance range of `model.hiiComps`
 * (`first`/`count` in RECORDS, not bytes), consumed only by the timing HUD's
 * per-tier HII sub-passes (`createGalaxyEngine.ts`'s `drawFrame`, gated on
 * `timing.enabled`). Structurally the same shape `hiiRegions.ts`'s own
 * `HiiRegionSegment` returns — no import between the two, since one lives in
 * shared `src/` and the other is this tool's own HUD-facing type.
 */
export type HiiSegment = {
  readonly label: string;
  readonly first: number;
  readonly count: number;
};
