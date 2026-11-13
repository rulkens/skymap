import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { LivePointer } from '../../../src/@types/live/LivePointer';
import { liveFilePath } from '../../../src/utils/live/liveFilePath';
import { liveFolderStamp } from '../../../src/utils/live/liveFolderStamp';
import { livePointerPath } from '../../../src/utils/live/livePointerPath';
import { writeFileAtomic } from '../io/writeFileAtomic';

/**
 * The one pointer writer. Call it only after every named file is in place, so a bad build never
 * moves the pointer; `builtAt` must be the Date the files' folder was stamped with.
 */
export function writeLivePointer(
  root: string,
  id: string,
  builtAt: Date,
  names: readonly string[],
): void {
  const stamp = liveFolderStamp(builtAt);
  const pointer: LivePointer = {
    date: builtAt.toISOString().slice(0, 10),
    builtAt: builtAt.toISOString(),
    files: Object.fromEntries(names.map((name) => [name, liveFilePath(id, stamp, name)])),
  };
  const path = join(root, livePointerPath(id));
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`));
}
