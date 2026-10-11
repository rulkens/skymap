/** A chunk object's JSON header; it carries no schema and decodes against its index's. */
export type OctreeChunkHeader = {
  readonly kind: 'chunk';
  /** The first root's level and Morton key (the root rows themselves live in the index). */
  readonly level: number;
  readonly morton: number;
  readonly nodes: number;
  readonly records: number;
};
