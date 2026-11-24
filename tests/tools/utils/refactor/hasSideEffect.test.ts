import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { hasSideEffect } from '../../../../tools/utils/refactor/hasSideEffect';

// The side-effect verdict for the expression `code`.
function effect(code: string): boolean {
  const source = ts.createSourceFile('x.ts', `(${code});`, ts.ScriptTarget.Latest, true);
  return hasSideEffect((source.statements[0] as ts.ExpressionStatement).expression);
}

describe('hasSideEffect', () => {
  it('flags work done on evaluation, however deep', () => {
    for (const code of [
      'f()',
      'new N()',
      'await p',
      'tag`x`',
      'x = 1',
      'x += 1',
      'x++',
      '--x',
      'delete o.k',
      '[0, g()]',
      'a ? b : f()',
      'list[i++]',
    ]) {
      expect(effect(code), code).toBe(true);
    }
  });

  it('passes plain values and function bodies that only run when called', () => {
    for (const code of [
      '1',
      'a.b',
      'a + b',
      '[1, 2]',
      '({ k: 1 })',
      '() => f()',
      'function () { f(); }',
    ]) {
      expect(effect(code), code).toBe(false);
    }
  });
});
