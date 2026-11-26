import type { R2SyncGroup } from '../@types/R2SyncGroup';

/**
 * Whether a published key in this group may never take new bytes. Keyed on the
 * transport flag, not an `immutable` cache header: DEPLOY.md, "Archives are
 * immutable by enforcement", says why the gzipped octree chunks opt out.
 */
export function refusesOverwrite(group: R2SyncGroup): boolean {
  return group.transport.kind === 'bulk' && group.transport.refuseOverwrite;
}
