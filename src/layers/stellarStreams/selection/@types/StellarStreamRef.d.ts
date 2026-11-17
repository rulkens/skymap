/** A stream is keyed by its meta slug, which outlives a rebuild's reordering of the bin. */
export type StellarStreamRef = { readonly type: 'stellarStream'; readonly slug: string };
