import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findReferences } from '../../../../../tools/utils/refactor/engine/findReferences';
import { findTypeErrors } from '../../../../../tools/utils/refactor/engine/findTypeErrors';
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
    syncOverlay(engine, { changed: [file], created: [], deleted: [] });
    expect(findReferences(engine, at).length).toBe(before + 1);
  });
});

describe('findTypeErrors', () => {
  it('is empty on a clean fixture and reports an error introduced through the overlay', () => {
    const clean = engineFixture({ 'shape.ts': SHAPE, 'use.ts': USE });
    try {
      const file = `${clean.root}/use.ts`;
      const files = [file, `${clean.root}/shape.ts`];
      expect(findTypeErrors(clean.engine, files)).toEqual([]);
      clean.engine.overlay.set(file, `${USE}export const s: string = area(1);\n`);
      syncOverlay(clean.engine, { changed: [file], created: [], deleted: [] });
      const errors = findTypeErrors(clean.engine, files);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ file, line: 4, column: 14 });
      expect(errors[0]?.message).toMatch(/^TS\d+: /);
    } finally {
      clean.dispose();
    }
  });

  it('reports a syntax error the semantic check does not', () => {
    const f = engineFixture({ 'a.ts': 'export const a = 1;\n' });
    try {
      const file = `${f.root}/a.ts`;
      f.engine.overlay.set(file, 'export const a = 1 +;\n');
      syncOverlay(f.engine, { changed: [file], created: [], deleted: [] });
      const errors = findTypeErrors(f.engine, [file]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatchObject({ file, line: 1 });
    } finally {
      f.dispose();
    }
  });

  it('asks only for the files given and skips a file no project owns', () => {
    const f = engineFixture({
      'bad.ts': 'export const n: number = "x";\n',
      'ok.ts': 'export {};\n',
    });
    try {
      expect(findTypeErrors(f.engine, [`${f.root}/ok.ts`])).toEqual([]);
      expect(findTypeErrors(f.engine, [`${f.root}/missing.ts`, '/elsewhere/x.ts'])).toEqual([]);
    } finally {
      f.dispose();
    }
  });
});

describe('findReferences on a template-literal key', () => {
  it('spans the text inside the backticks', () => {
    const text =
      'export type S = { radius: number };\ndeclare const s: S;\nexport const a = s[`radius`];\n';
    const f = engineFixture({ 'k.ts': text });
    try {
      const start = text.indexOf('radius');
      const refs = findReferences(f.engine, { file: `${f.root}/k.ts`, start, end: start + 6 });
      expect(refs.map((r) => text.slice(r.start, r.end))).toEqual(['radius', 'radius']);
    } finally {
      f.dispose();
    }
  });
});

describe('typescript-native pin', () => {
  it('typescript-native is pinned to an exact version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.devDependencies['typescript-native']).toMatch(/^npm:typescript@\d+\.\d+\.\d+$/);
  });
});
