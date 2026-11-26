import { posix } from 'node:path';
import type { R2SyncGroup } from '../@types/R2SyncGroup';
import type { RemoteHashes } from '../@types/RemoteHashes';
import { refusesOverwrite } from './refusesOverwrite';

/**
 * The lines that stop a sync before its first upload, or `[]` to proceed. A key
 * not on R2 yet is a normal upload; one on R2 without an MD5 cannot be vouched
 * for, so it stops the sync too rather than pass silently. `localHashes` needs
 * only the keys `remoteHashes` holds.
 */
export function immutableKeyClashReport(
  groups: readonly R2SyncGroup[],
  localHashes: ReadonlyMap<string, string>,
  remoteHashes: RemoteHashes,
): string[] {
  const changedByDir = new Map<string, string[]>();
  const unverified: string[] = [];
  for (const group of groups.filter(refusesOverwrite)) {
    let unknown = 0;
    for (const { r2Key } of group.files) {
      if (!remoteHashes.has(r2Key)) continue;
      const remote = remoteHashes.get(r2Key);
      if (remote === null) {
        unknown++;
      } else if (remote !== localHashes.get(r2Key)) {
        const dir = posix.dirname(r2Key);
        changedByDir.set(dir, [...(changedByDir.get(dir) ?? []), posix.basename(r2Key)]);
      }
    }
    if (unknown > 0) unverified.push(`  ${group.label}: ${unknown} key(s) on R2 with no MD5`);
  }

  const lines: string[] = [];
  if (changedByDir.size > 0) {
    lines.push('✗ Immutable keys already on R2 hold different bytes; nothing was uploaded:');
    for (const dir of [...changedByDir.keys()].sort()) {
      const names = changedByDir.get(dir) ?? [];
      lines.push(`  ${dir}/`, ...names.sort().map((name) => `    ${name}`));
    }
    lines.push(
      '  Bytes changed under a published prefix: bump the prefix (DEPLOY.md, tile versions).',
    );
  }
  if (unverified.length > 0) {
    lines.push('✗ The preflight could not compare every immutable key; nothing was uploaded:');
    lines.push(...unverified);
  }
  return lines;
}
