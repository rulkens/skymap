import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

/** The settings cluster an entry's switch lives in: its `cluster`, which a show entry may
 * omit to mean its `key`. Read and write both go through here, so a row never reads one
 * cluster and writes another. */
export function visibilityClusterOf(entry: VisibilityEntry): string {
  return 'key' in entry ? (entry.cluster ?? entry.key) : entry.cluster;
}
