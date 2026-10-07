/**
 * One entry of `ATTRIBUTIONS.md` with the shape of its text kept: `heading`
 * is its `###` line, `section` the `##` it stands under, `notes` that
 * section's opening paragraphs, and `bullets` each bullet's own Markdown by
 * label (`bullets.Licence`), line breaks and all.
 */
export type AttributionRecord = {
  readonly id: string;
  readonly heading: string;
  readonly section: string;
  readonly notes: readonly string[];
  readonly bullets: Readonly<Record<string, string>>;
};
