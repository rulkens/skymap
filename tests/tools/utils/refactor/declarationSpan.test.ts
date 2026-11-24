import { describe, expect, it } from 'vitest';
import { declarationSpan } from '../../../../tools/utils/refactor/declarationSpan';

// The text left once the declaration named `name` (its first occurrence) is cut.
function without(text: string, name: string, last = false): string {
  const start = last ? text.lastIndexOf(name) : text.indexOf(name);
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

  it('takes a trailing comment on the same line', () => {
    const text = 'export const foo = 1; // why\nexport const keep = 2;\n';
    expect(without(text, 'foo')).toBe('export const keep = 2;\n');
  });

  it("cuts a declarator from its own leading comment, and keeps its neighbour's", () => {
    const text = 'export const a = 1,\n  // about b\n  b = 2,\n  // about c\n  c = 3;\n';
    expect(without(text, 'b =')).toBe('export const a = 1,\n  // about c\n  c = 3;\n');
  });

  it('keeps a module header comment at the top, or after a shebang', () => {
    expect(without('/** header */\nexport const foo = 1;\nexport const keep = 2;\n', 'foo')).toBe(
      '/** header */\nexport const keep = 2;\n',
    );
    expect(
      without(
        '#!/usr/bin/env node\n// header\nexport const foo = 1;\nexport const keep = 2;\n',
        'foo',
      ),
    ).toBe('#!/usr/bin/env node\n// header\nexport const keep = 2;\n');
  });

  it('cuts one specifier of an export list, or the whole statement when alone', () => {
    expect(without('const alpha = 1;\nconst b = 2;\nexport { alpha, b };\n', 'alpha', true)).toBe(
      'const alpha = 1;\nconst b = 2;\nexport { b };\n',
    );
    expect(without('const solo = 1;\nexport { solo };\n', 'solo', true)).toBe('const solo = 1;\n');
  });
});
