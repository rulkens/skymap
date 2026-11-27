import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledFonts } from '../vite.config';

// The hook keys on tokens.css's path and rebases relative to it, so a move of either file
// otherwise drops the control page's fonts with no build error.
const tokensCss = join(import.meta.dirname, '../../shared/src/styles/tokens.css');

describe('bundledFonts', () => {
  it('points every font of tokens.css at a file on disk', () => {
    const transform = bundledFonts.transform as (code: string, id: string) => string | undefined;
    const out = transform(readFileSync(tokensCss, 'utf8'), tokensCss);
    const urls = [...(out ?? '').matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(existsSync(resolve(dirname(tokensCss), url)), url).toBe(true);
  });
});
