/**
 * One family of sources on the data pages. `id` is its anchor on the index
 * and, where `pages` is `one`, the page all its entries share (each entry a
 * section, `#<entry id>`); with `each` every entry has a page of its own.
 * An entry belongs to the family that lists its id under `ids`, or else the
 * one that lists its section of `ATTRIBUTIONS.md` under `sections`. `step` is
 * the section of the pipeline page where this family's files are handled.
 */
export type DataFamily = {
  readonly id: string;
  readonly name: string;
  readonly about: string;
  readonly pages: 'each' | 'one';
  readonly sections: readonly string[];
  readonly ids: readonly string[];
  readonly step?: string;
};
