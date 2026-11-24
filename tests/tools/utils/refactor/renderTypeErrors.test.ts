import { describe, expect, it } from 'vitest';
import { renderTypeErrors } from '../../../../tools/utils/refactor/renderTypeErrors';

describe('renderTypeErrors', () => {
  it('prints the count and root-relative file:line:col rows', () => {
    const errors = [
      { file: '/r/src/a.ts', line: 3, column: 5, message: 'TS2322: Type mismatch' },
      { file: '/r/tests/b.ts', line: 10, column: 1, message: 'TS2339: No property' },
    ];
    expect(renderTypeErrors(errors, '/r')).toBe(
      [
        '2 type error(s) after this change:',
        '  src/a.ts:3:5  TS2322: Type mismatch',
        '  tests/b.ts:10:1  TS2339: No property',
      ].join('\n'),
    );
  });
});
