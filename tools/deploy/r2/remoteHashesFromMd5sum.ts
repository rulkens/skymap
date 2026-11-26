import type { RemoteHashes } from '../@types/RemoteHashes';

const LINE = /^(\S*) {2}(.+)$/;

/** Parse `rclone md5sum` run at the bucket root: `<md5>  <key>` per existing key; keys may hold spaces. */
export function remoteHashesFromMd5sum(output: string): RemoteHashes {
  const hashes = new Map<string, string | null>();
  for (const line of output.split('\n')) {
    const match = LINE.exec(line.trimEnd());
    if (!match) continue;
    const [, hash = '', key = ''] = match;
    hashes.set(key, /^[0-9a-fA-F]{32}$/.test(hash) ? hash.toLowerCase() : null);
  }
  return hashes;
}
