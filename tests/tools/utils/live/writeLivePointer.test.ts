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
    writeLivePointer(root, 'satellites', new Date('2026-11-13T04:23:40Z'), ['satellites.satg']);
    const p = JSON.parse(
      readFileSync(join(root, livePointerPath('satellites')), 'utf8'),
    ) as LivePointer;
    expect(p.date).toBe('2026-11-13');
    expect(p.files['satellites.satg']).toBe(
      liveFilePath('satellites', '2026-11-13T0423Z', 'satellites.satg'),
    );
  });
});
