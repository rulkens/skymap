import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { liveFilePath } from '../../../src/utils/live/liveFilePath';
import { writeLivePointer } from '../../../tools/utils/live/writeLivePointer';
import { writePublishList } from '../../../tools/live/writePublishList';

function build(withFile: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'publish-list-'));
  if (withFile) {
    const file = join(root, liveFilePath('satellites', '2026-11-13', 'satellites.satg'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'x');
  }
  writeLivePointer(root, 'satellites', '2026-11-13', ['satellites.satg']);
  return root;
}

describe('writePublishList', () => {
  it('puts the pointer last', () => {
    const list = writePublishList('satellites', build(true));
    expect(list.at(-1)?.path).toBe('live/v1/satellites.json');
    expect(list).toHaveLength(2);
  });

  it('marks dated files immutable and the pointer no-cache', () => {
    const [file, pointer] = writePublishList('satellites', build(true));
    expect(file?.cacheControl).toContain('immutable');
    expect(file?.gzip).toBe(true);
    expect(pointer?.cacheControl).toBe('no-cache');
    expect(pointer?.contentType).toBe('application/json');
  });

  it('fails when a file the pointer names is missing', () => {
    expect(() => writePublishList('satellites', build(false))).toThrow(/was not built/);
  });
});
