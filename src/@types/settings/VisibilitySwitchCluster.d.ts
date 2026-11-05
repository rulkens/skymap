/** A settings cluster as the visibility switches see it, addressed by name: a boolean field
 * at its root or in one `items` row. Every other field is opaque to them. */
export type VisibilitySwitchCluster = {
  readonly [field: string]: unknown;
  readonly items?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};
