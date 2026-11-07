/** A stream's [Fe/H] and where it was measured; `ref` null means the curated table's median stood in. */
export type StreamMetallicity = {
  readonly feh: number;
  readonly ref: string | null;
};
