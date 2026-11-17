import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { LivePointer } from '../../../../src/@types/live/LivePointer';
import { liveFilePath } from '../../../../src/utils/live/liveFilePath';
import { livePointerPath } from '../../../../src/utils/live/livePointerPath';
import { writeLivePointer } from '../../../../tools/utils/live/writeLivePointer';

describe('writeLivePointer', () => {
  it('names each file under the minute-stamped folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'live-pointer-'));
    writeLivePointer(root, 'satellites', '2026-11-13', new Date('2026-11-13T04:23:40Z'), [
      'satellites.satg',
    ]);
    const p = JSON.parse(
      readFileSync(join(root, livePointerPath('satellites')), 'utf8'),
    ) as LivePointer;
    expect(p.date).toBe('2026-11-13');
    expect(p.files['satellites.satg']).toBe(
      liveFilePath('satellites', '2026-11-13T0423Z', 'satellites.satg'),
    );
  });

  // A bake of yesterday's sky built after midnight: the pointer dates the data, the folder the build.
  it('dates the pointer by the data, not the build', () => {
    const root = mkdtempSync(join(tmpdir(), 'live-pointer-'));
    writeLivePointer(root, 'clouds', '2026-11-12', new Date('2026-11-13T04:23:40Z'), ['a.webp']);
    const p = JSON.parse(
      readFileSync(join(root, livePointerPath('clouds')), 'utf8'),
    ) as LivePointer;
    expect(p.date).toBe('2026-11-12');
    expect(p.files['a.webp']).toBe(liveFilePath('clouds', '2026-11-13T0423Z', 'a.webp'));
  });
});
