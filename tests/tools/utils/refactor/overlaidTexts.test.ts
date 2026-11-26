import { describe, expect, it } from 'vitest';
import { overlaidTexts } from '../../../../tools/utils/refactor/overlaidTexts';

describe('overlaidTexts', () => {
  it('the overlay shadows the disk and a removed file is dropped', () => {
    const disk = new Map([
      ['/r/a.ts', 'disk a'],
      ['/r/b.ts', 'disk b'],
      ['/r/c.ts', 'disk c'],
    ]);
    const texts = overlaidTexts(disk, {
      overlay: new Map([
        ['/r/a.ts', 'edited a'],
        ['/r/new.ts', 'new'],
      ]),
      removed: new Set(['/r/b.ts']),
    });
    expect([...texts]).toEqual([
      ['/r/a.ts', 'edited a'],
      ['/r/c.ts', 'disk c'],
      ['/r/new.ts', 'new'],
    ]);
    expect(disk.get('/r/a.ts')).toBe('disk a');
  });
});
