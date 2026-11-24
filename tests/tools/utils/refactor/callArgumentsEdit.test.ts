import { describe, expect, it } from 'vitest';
import { callArgumentsEdit } from '../../../../tools/utils/refactor/callArgumentsEdit';

const NAMES = ['width', 'height', 'label'];

// Rewrites the call whose callee is the first `area` after `marker`, or returns the refusal.
function rewrite(text: string, marker = '', names = NAMES): string {
  const start = text.indexOf('area', text.indexOf(marker));
  const result = callArgumentsEdit(text, { file: 'x.tsx', start, end: start + 4 }, names);
  if (!result.ok) return `refused: ${result.refusal}`;
  const { edit } = result;
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}

describe('callArgumentsEdit', () => {
  it('positional arguments become keys', () => {
    expect(rewrite('area(1, 2);')).toBe('area({ width: 1, height: 2 });');
  });

  it('a matching identifier is shorthand', () => {
    expect(rewrite('area(width, h);')).toBe('area({ width, height: h });');
  });

  it('omitted trailing arguments are omitted keys, and no arguments is {}', () => {
    expect(rewrite('area(1);')).toBe('area({ width: 1 });');
    expect(rewrite('area();')).toBe('area({});');
  });

  it('refuses a spread and too many arguments', () => {
    expect(rewrite('area(...xs);')).toContain('refused: an argument is a spread');
    expect(rewrite('area(1, 2, 3, 4);')).toContain('refused: passes 4 arguments');
  });

  it('keeps a multi-line argument verbatim, comments included', () => {
    const text = 'area(\n  1,\n  mk({\n    a: 1, // keep\n  }),\n);';
    expect(rewrite(text)).toBe('area(\n  { width: 1, height: mk({\n    a: 1, // keep\n  }) },\n);');
  });

  it('refuses a comment between arguments rather than drop it', () => {
    expect(rewrite('area(\n  1, // w\n  2,\n);')).toContain('refused: a comment between');
  });

  it('keeps a trailing comma valid', () => {
    expect(rewrite('area(1, 2,);')).toBe('area({ width: 1, height: 2 },);');
  });

  it('refuses a call through a property access', () => {
    expect(rewrite('utils.area(1, 2);')).toContain('refused: called through a property access');
  });

  it('refuses type arguments, an optional call and new', () => {
    expect(rewrite('area<number>(1, 2);')).toContain('refused: the call has type arguments');
    expect(rewrite('area?.(1, 2);')).toContain('refused: an optional call');
    expect(rewrite('new area(1, 2);')).toContain('refused: a `new` is not a function call');
  });

  it('refuses a name that is not called', () => {
    expect(rewrite('use(area);')).toContain('refused: not a plain call');
  });

  it('rewrites a call inside a template and inside JSX', () => {
    expect(rewrite('const s = `${area(1, 2)}`;')).toBe(
      'const s = `${area({ width: 1, height: 2 })}`;',
    );
    expect(rewrite('const e = <C v={area(1, 2)} />;')).toBe(
      'const e = <C v={area({ width: 1, height: 2 })} />;',
    );
  });
});
