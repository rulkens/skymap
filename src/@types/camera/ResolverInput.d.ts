/**
 * ResolverInput — the bundle of state `resolveFocusTarget` consumes when
 * mapping a parsed `FocusTarget` onto a concrete `(source, localIdx)`
 * pair against the engine's currently-loaded data.
 *
 * The resolver is pure: it walks `clouds`, `famousMeta`, and `aliasMap`
 * without touching the DOM or the engine's render loop.  The shape
 * lives here so both the resolver and its callers (the URL-sync hook,
 * tests) can talk about it without reaching into the runtime module.
 */

import type { FocusTarget } from './FocusTarget';
import type { PointCloud } from '../data/PointCloud';
import type { Source } from '../../data/sources';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';

export type ResolverInput = {
  target: FocusTarget;
  clouds: { source: Source; cloud: PointCloud }[];
  famousMeta: readonly FamousMetaEntry[];
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};
