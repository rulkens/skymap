import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findReferences } from '../../../../../tools/utils/refactor/engine/findReferences';
import { syncOverlay } from '../../../../../tools/utils/refactor/engine/syncOverlay';
import { engineFixture } from '../../../../helpers/refactor/engineFixture';

const SHAPE = 'export function area(r: number): number {\n  return r * r;\n}\n';
const USE = "import { area } from './shape';\n// 🌌 sky\nexport const a = area(2);\n";

const fixture = engineFixture({ 'shape.ts': SHAPE, 'use.ts': USE });
const { engine, root } = fixture;
const at = {
  file: `${root}/shape.ts`,
  start: SHAPE.indexOf('area'),
  end: SHAPE.indexOf('area') + 4,
};
afterAll(fixture.dispose);

describe('findReferences', () => {
  it('returns the declaration and every use, as exact token spans', () => {
    const refs = findReferences(engine, at);
    expect(refs).toHaveLength(3);
    for (const ref of refs) {
      const text = ref.file.endsWith('shape.ts') ? SHAPE : USE;
      expect(text.slice(ref.start, ref.end)).toBe('area');
    }
  });

  it('spans index a JavaScript string after a non-ASCII character', () => {
    const refs = findReferences(engine, at).filter((r) => r.file.endsWith('use.ts'));
    const last = refs[refs.length - 1];
    expect(last && USE.slice(last.start, last.end)).toBe('area');
    expect(last && last.start).toBe(USE.lastIndexOf('area'));
  });

  it('reports a file in two projects once', () => {
    const two = engineFixture({ 'shape.ts': SHAPE, 'use.ts': USE }, ['tsconfig.json', 'b.json']);
    try {
      expect(findReferences(two.engine, { ...at, file: `${two.root}/shape.ts` })).toHaveLength(3);
    } finally {
      two.dispose();
    }
  });
});

describe('syncOverlay', () => {
  it('makes the engine see changed text', () => {
    const before = findReferences(engine, at).length;
    const file = `${root}/use.ts`;
    engine.overlay.set(file, `${USE}export const b = area(3);\n`);
    syncOverlay(engine, [file]);
    expect(findReferences(engine, at).length).toBe(before + 1);
  });
});

describe('typescript-native pin', () => {
  it('typescript-native is pinned to an exact version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.devDependencies['typescript-native']).toMatch(/^npm:typescript@\d+\.\d+\.\d+$/);
  });
});
