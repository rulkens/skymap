import type { LsjsonEntry } from '../@types/LsjsonEntry';
import type { RemoteHashes } from '../@types/RemoteHashes';

/** Parse `rclone lsjson --hash` run at the bucket root, so each `Path` is a full key. */
export function remoteHashesFromLsjson(json: string): RemoteHashes {
  const entries = JSON.parse(json) as LsjsonEntry[];
  return new Map(
    entries
      .filter((entry) => !entry.IsDir)
      .map((entry) => [entry.Path, entry.Hashes?.md5?.toLowerCase() || null]),
  );
}
