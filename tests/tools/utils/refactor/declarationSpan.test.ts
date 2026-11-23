import { describe, expect, it } from 'vitest';
import { declarationSpan } from '../../../../tools/utils/refactor/declarationSpan';

// The text left once the declaration named `name` (its first occurrence) is cut.
function without(text: string, name: string): string {
  const start = text.indexOf(name);
  const { start: from, end } = declarationSpan(text, {
    file: '/x.ts',
    start,
    end: start + name.length,
  });
  return text.slice(0, from) + text.slice(end);
}

describe('declarationSpan', () => {
  it('takes the leading JSDoc with the statement', () => {
    const text =
      'export const keep = 1;\n\n/** Why it exists. */\nexport const foo = 2;\n\nexport const tail = 3;\n';
    expect(without(text, 'foo')).toBe('export const keep = 1;\n\nexport const tail = 3;\n');
  });

  it('leaves a detached comment above a blank line', () => {
    const text = '// header\n\nexport const foo = 2;\nexport const bar = 3;\n';
    expect(without(text, 'foo')).toBe('// header\n\nexport const bar = 3;\n');
  });

  it('cuts one declarator of two', () => {
    expect(without('export const a = 1, b = 2;\n', 'a =')).toBe('export const b = 2;\n');
    expect(without('export const a = 1, b = 2;\n', 'b =')).toBe('export const a = 1;\n');
  });

  it('takes every overload with the implementation', () => {
    const text =
      'export function f(a: string): string;\nexport function f(a: number): number;\nexport function f(a: unknown) {\n  return a;\n}\nexport const keep = 1;\n';
    expect(without(text, 'f')).toBe('export const keep = 1;\n');
  });
});
