import { describe, it, expect } from 'vitest';
import { findTsReferences } from '../src/findTsReferences';

const values = (path: string, text: string, extra: string[] = []) =>
  findTsReferences(path, text, extra).map((r) => r.value);

describe('findTsReferences', () => {
  it('finds every TS reference form', () => {
    const text = [
      `import a from './import';`,
      `export * from './export';`,
      `const b = await import('./dynamic');`,
      `type T = import('./type').T;`,
      `import c = require('./equals');`,
      `const d = require('./require');`,
      `vi.mock('./vimock');`,
      `jest.mock('./jestmock');`,
      `vi.importActual('./actual');`,
    ].join('\n');
    expect(values('/r/a.ts', text)).toEqual([
      './import',
      './export',
      './dynamic',
      './type',
      './equals',
      './require',
      './vimock',
      './jestmock',
      './actual',
    ]);
  });

  it('reports spans that exclude the quotes', () => {
    const text = `import a from "./x";`;
    const [ref] = findTsReferences('/r/a.ts', text, []);
    expect(text.slice(ref!.start, ref!.end)).toBe('./x');
  });

  it('parses .tsx generics and JSX', () => {
    const text = `const f = <T,>(x: T) => x;\nconst e = <p>import('./fake')</p>;\nimport g from './real';`;
    expect(values('/r/a.tsx', text)).toEqual(['./real']);
  });

  it.each(['/r/a.js', '/r/a.mjs', '/r/a.cjs', '/r/a.jsx'])('parses JSX in %s', (path) => {
    expect(values(path, `const e = <div>it's {import('./x')}</div>;`)).toEqual(['./x']);
  });

  it('reports a literal with an escape by its value and its raw span', () => {
    const text = `import './\\x61';`;
    const [ref] = findTsReferences('/r/a.ts', text, []);
    expect(ref!.value).toBe('./a');
    expect(text.slice(ref!.start, ref!.end)).toBe('./\\x61');
  });

  it('skips an unterminated literal, whose span has no closing quote', () => {
    expect(values('/r/a.ts', `import './x\nexport {};`)).toEqual([]);
  });

  it('ignores strings that are not references', () => {
    expect(values('/r/a.ts', `const s = './x'; foo('./y');`)).toEqual([]);
  });

  it('reads an extra mock callee', () => {
    expect(values('/r/a.ts', `td.mock('./x');`, ['td.mock'])).toEqual(['./x']);
    expect(values('/r/a.ts', `td.mock('./x');`)).toEqual([]);
  });
});
