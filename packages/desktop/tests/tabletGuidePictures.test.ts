import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The pictures live once, in the website's assets (tabletGuideDir); a renamed or moved one would
// leave its step as bare text on every tablet, with nothing logged.
const DESKTOP = join(import.meta.dirname, '..');
const GUIDE = join(DESKTOP, '../website/src/assets/docs/tablet-guide');

describe('the tablet setup page', () => {
  it('names only pictures the website keeps, and ships that folder', () => {
    const page = readFileSync(join(DESKTOP, 'assets/tablet-setup.html'), 'utf8');
    const names = [...page.matchAll(/src="\/guide\/([^"]+)"/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !existsSync(join(GUIDE, name)))).toEqual([]);
    expect(readFileSync(join(DESKTOP, 'electron-builder.yml'), 'utf8')).toContain(
      'from: ../website/src/assets/docs/tablet-guide',
    );
  });
});
