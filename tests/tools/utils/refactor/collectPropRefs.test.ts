import { afterAll, describe, expect, it } from 'vitest';
import { collectPropRefs } from '../../../../tools/utils/refactor/collectPropRefs';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES: Record<string, string> = {
  'src/shape.ts':
    'export type Shape = { radius: number; sides: number };\nexport const origin = 0;',
  'src/use.ts': `import type { Shape } from './shape';
declare const a: Shape;
export const lit: Pick<Shape, 'radius'> = { radius: 1 };
export const partial: Partial<Shape> = { radius: 2 };
export const read = a.radius;
export const { radius } = a;
export const key = a['radius'];
export type R = Shape['radius'];
export const tight: Shape = { radius, sides: 1 };
`,
  'src/ui.tsx': `import type { Shape } from './shape';
declare function Circle(p: Shape): null;
export const e = <Circle radius={1} sides={2} />;
`,
  'tests/use.test.ts':
    "import type { Shape } from '../src/shape';\ndeclare const a: Shape;\nexport const t = a.radius;\n",
  'src/lonely.ts': 'export type Lonely = { radius: number };',
  'src/stringly.ts':
    "import type { Shape } from './shape';\nexport const f = (k: keyof Shape) => k === 'radius';\n",
};
FILES['tsconfig.json'] = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    jsx: 'preserve',
    module: 'ESNext',
    moduleResolution: 'bundler',
  },
  include: ['**/*.ts', '**/*.tsx'],
});

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

const absolute = (f: string) => f.slice(fixture.root.length + 1);
const read = (f: string) => FILES[absolute(f)] ?? '';
const texts = () => new Map(Object.entries(FILES).map(([f, t]) => [`${fixture.root}/${f}`, t]));

function collect(file: string, typeName: string, prop: string) {
  return collectPropRefs({
    address: { file, typeName, prop },
    engine: fixture.engine,
    read,
    texts,
  });
}

function foundOf(file: string, typeName: string, prop: string) {
  const result = collect(file, typeName, prop);
  if (!result.ok) throw new Error(result.refusal);
  return result.found;
}

describe('collectPropRefs', () => {
  it('finds a write through Pick<Shape, radius> typed literal', () => {
    const { report } = foundOf('src/shape.ts', 'Shape', 'radius');
    const kinds = report.refs.filter((r) => r.filePath === 'src/use.ts' && r.line === 3);
    expect(kinds.map((r) => r.kind)).toEqual(['write']);
  });

  it('classifies every form the engine reports, JSX and indexed access included', () => {
    const { report } = foundOf('src/shape.ts', 'Shape', 'radius');
    const kinds = report.refs.map((r) => `${r.filePath}:${r.line}:${r.kind}`).sort();
    expect(kinds).toEqual([
      'src/ui.tsx:3:write',
      'src/use.ts:3:write',
      'src/use.ts:4:write',
      'src/use.ts:5:read',
      'src/use.ts:6:shorthand-destructure',
      'src/use.ts:7:string-key',
      'src/use.ts:8:string-key',
      'src/use.ts:9:shorthand-write',
      'tests/use.test.ts:3:read',
    ]);
  });

  it('a use inside tests/ keeps its kind with inTest true', () => {
    const { report } = foundOf('src/shape.ts', 'Shape', 'radius');
    const inTests = report.refs.find((r) => r.filePath === 'tests/use.test.ts');
    expect(inTests).toMatchObject({ kind: 'read', inTest: true });
    expect(report.testCount).toBe(1);
  });

  it('the declaration is not counted', () => {
    const found = foundOf('src/lonely.ts', 'Lonely', 'radius');
    expect(found.refs).toHaveLength(0);
    expect(found.at.start).toBe(FILES['src/lonely.ts']!.indexOf('radius'));
  });

  it('refuses a file in none of the projects', () => {
    const result = collectPropRefs({
      address: { file: 'elsewhere/shape.ts', typeName: 'Shape', prop: 'radius' },
      engine: fixture.engine,
      read: () => 'export type Shape = { radius: number };',
      texts,
    });
    expect(result).toEqual({ ok: false, refusal: expect.stringContaining('none of the engine') });
  });

  it('refuses a property the type does not have', () => {
    const result = collect('src/shape.ts', 'Shape', 'diameter');
    expect(result).toEqual({ ok: false, refusal: expect.stringContaining('no direct member') });
  });

  it('reports the quoted mentions the engine does not track, root-relative', () => {
    const { unreported } = foundOf('src/shape.ts', 'Shape', 'radius');
    const files = unreported.map((f) => `${f.file}:${f.line}`).sort();
    // Pick's string and the keyof comparison; the a['radius'] key was reported by the engine.
    expect(files).toEqual(['src/stringly.ts:2', 'src/use.ts:3']);
  });
});
