import type { Source } from '../../data/sources';
import type { PointCloud } from '../data/PointCloud';

/**
 * Hook the engine provides to the resolver: given a (source, localIdx)
 * pair the picker returned, resolve it into the cloud needed to build
 * a PointInfo.  Production wires this to engine.ts's `clouds.get(source)`
 * lookup; tests pass a stub.
 *
 * Returns `null` when the source's cloud isn't loaded (yet) or when
 * `localIdx >= cloud.count` (tier-swap window where the picker's
 * baked identity references a row past the freshly-uploaded smaller
 * cloud — the bounds check defends against the same race the prior
 * `fromGlobalIdx` decoder did).
 */
export type ResolveSelection = (
  selection: { source: Source; localIdx: number },
) => { source: Source; localIdx: number; cloud: PointCloud } | null;
