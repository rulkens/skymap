/**
 * DepthSampledPasses — a marker inside a foreground body roster: these passes
 * read the row's depth as a texture, so each body row splits around them into
 * a depth-clearing step before and a depth-loading step after.
 */
export type DepthSampledPasses = { readonly sampleDepth: readonly string[] };
