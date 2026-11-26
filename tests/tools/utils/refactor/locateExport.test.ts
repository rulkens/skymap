import { describe, it, expect } from 'vitest';
import { locateExport } from '../../../../tools/utils/refactor/locateExport';

const TEXT = [
  'export function fn() {}',
  'export const value = 1;',
  'export type Shape = { r: number };',
  'const hidden = 1;',
  'export function over(a: string): void;',
  'export function over(a: number): void;',
  'export function over(a: unknown): void {}',
  'export type Twin = number;',
  'export const Twin = 1;',
  '',
].join('\n');

function nameAt(symbol: string): string | null {
  const found = locateExport(TEXT, { file: 'x.ts', symbol });
  return found.ok ? TEXT.slice(found.at.start, found.at.end) : null;
}

describe('locateExport', () => {
  it('finds an exported function, a const and a type alias by their name token', () => {
    expect(nameAt('fn')).toBe('fn');
    expect(nameAt('value')).toBe('value');
    expect(nameAt('Shape')).toBe('Shape');
  });

  it('refuses a name that is not exported', () => {
    const found = locateExport(TEXT, { file: 'x.ts', symbol: 'hidden' });
    expect(found).toEqual({
      ok: false,
      refusal: expect.stringContaining('not an exported declaration'),
    });
  });

  it('counts function overloads as one declaration', () => {
    expect(nameAt('over')).toBe('over');
  });

  it('refuses an ambiguous name and lists the candidates', () => {
    const found = locateExport(TEXT, { file: 'x.ts', symbol: 'Twin' });
    expect(found).toEqual({
      ok: false,
      refusal: expect.stringMatching(
        /Ambiguous symbol 'Twin'.*2 declarations[\s\S]*line 8[\s\S]*line 9/,
      ),
    });
  });
});

// The name token `symbol` resolves to, with the text before it, so the position is checked too.
function locate(text: string, symbol: string): string | null {
  const found = locateExport(text, { file: 'x.ts', symbol });
  return found.ok
    ? `${text.slice(0, found.at.start)}[${text.slice(found.at.start, found.at.end)}]`
    : null;
}

describe('locateExport through an export list', () => {
  it("finds the specifier's exported name in a re-export", () => {
    expect(locate("export { bar as foo } from './bar';\n", 'foo')).toBe('export { bar as [foo]');
  });

  it('finds the local declaration of `export { bar as foo }`, exported itself or not', () => {
    expect(locate('export function bar() {}\nexport { bar as foo };\n', 'foo')).toBe(
      'export function [bar]',
    );
    expect(locate('const bar = 1;\nexport { bar as foo };\n', 'foo')).toBe('const [bar]');
  });
});
