/**
 * Which identities cover each scene body some show entry's `bodies` lists, keyed by body id
 * in entry, item and table order. Memoised on the `entries` reference: `createLayers`
 * composes `state.visibilityEntries` once, and the frame context reads this every frame.
 */

import type { FadeIdentity } from '../../@types/animation/FadeIdentity';
import type { CoveredSceneBody } from '../../@types/engine/frame/CoveredSceneBody';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { visibilityAddressOf } from './visibilityAddressOf';

let lastEntries: readonly VisibilityEntry[] | null = null;
let lastCoverage: ReadonlyMap<string, CoveredSceneBody> = new Map();

export function sceneBodyCoverageOf(
  entries: readonly VisibilityEntry[],
): ReadonlyMap<string, CoveredSceneBody> {
  if (entries === lastEntries) return lastCoverage;
  const coverage = new Map<string, { body: CoveredSceneBody['body']; coveredBy: FadeIdentity[] }>();
  for (const entry of entries) {
    if (!('key' in entry) || entry.bodies === undefined) continue;
    const address = visibilityAddressOf(entry);
    for (const [item, bodies] of Object.entries(entry.bodies)) {
      for (const body of bodies ?? []) {
        const covered = coverage.get(body.id) ?? { body, coveredBy: [] };
        covered.coveredBy.push({ address, item });
        coverage.set(body.id, covered);
      }
    }
  }
  lastEntries = entries;
  lastCoverage = coverage;
  return coverage;
}
