import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { LivePointer } from '../../../src/@types/live/LivePointer';
import { liveFilePath } from '../../../src/utils/live/liveFilePath';
import { livePointerPath } from '../../../src/utils/live/livePointerPath';
import { writeFileAtomic } from '../io/writeFileAtomic';

/** The one pointer writer: call it only after every named file is in place, so a bad build never moves the pointer. */
export function writeLivePointer(
  root: string,
  id: string,
  date: string,
  names: readonly string[],
): void {
  const pointer: LivePointer = {
    date,
    builtAt: new Date().toISOString(),
    files: Object.fromEntries(names.map((name) => [name, liveFilePath(id, date, name)])),
  };
  const path = join(root, livePointerPath(id));
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`));
}
