import { describe, expect, it } from 'vitest';
import { resolveRelativeImport } from '../../../tools/atlas/resolveRelativeImport';

describe('resolveRelativeImport', () => {
  const src = '/repo/src';
  const known = new Set(['utils/a.ts', 'components/B/B.tsx', 'utils/math/index.ts', 'data/x.wesl']);
  const r = (fromAbs: string, spec: string) => resolveRelativeImport(fromAbs, spec, src, known);

  it('resolves .ts, .tsx and index forms, strips vite suffixes, ignores packages', () => {
    expect(r('/repo/src/services/s.ts', '../utils/a')).toBe('utils/a.ts');
    expect(r('/repo/src/main.tsx', './components/B/B')).toBe('components/B/B.tsx');
    expect(r('/repo/src/utils/b.ts', './math')).toBe('utils/math/index.ts');
    expect(r('/repo/src/utils/b.ts', '../data/x.wesl?static')).toBe('data/x.wesl');
    expect(r('/repo/src/utils/b.ts', 'react')).toBeNull();
    expect(r('/repo/src/utils/b.ts', './missing')).toBeNull();
  });

  it('resolves an importer outside src (a test file) into src', () => {
    expect(r('/repo/tests/utils/a.test.ts', '../../src/utils/a')).toBe('utils/a.ts');
    expect(r('/repo/tests/utils/a.test.ts', './fixture')).toBeNull();
  });
});
