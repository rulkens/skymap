import type { DepthSampledPasses } from '../../@types/engine/frame/DepthSampledPasses';

/** A body roster as the flat names it draws, each marker's passes once. */
export function rosterPassNames(roster: readonly (string | DepthSampledPasses)[]): string[] {
  return roster.flatMap((entry) => (typeof entry === 'string' ? [entry] : entry.sampleDepth));
}
