import { describe, expect, it } from 'vitest';
import { memberSpan } from '../../../../tools/utils/refactor/memberSpan';

// Cuts the member named by the first `radius` of `text`.
function cut(text: string, file = 'x.tsx'): string {
  const start = text.indexOf('radius');
  const span = memberSpan(text, { file, start, end: start + 6 });
  return text.slice(0, span.start) + text.slice(span.end);
}

describe('memberSpan', () => {
  it('cuts a middle property with its comma', () => {
    expect(cut('const o = { a: 1, radius: 2, b: 3 };')).toBe('const o = { a: 1, b: 3 };');
    expect(cut('type T = { a: number; radius: number; b: number };')).toBe(
      'type T = { a: number; b: number };',
    );
  });

  it('cuts the last property and the comma before it', () => {
    expect(cut('const o = { a: 1, radius: 2 };')).toBe('const o = { a: 1 };');
    expect(cut('const o = { a, radius };')).toBe('const o = { a };');
    expect(cut('const o = { a: 1, radius: 2, };')).toBe('const o = { a: 1, };');
  });

  it('cuts the first property inline', () => {
    expect(cut('type T = { radius: number, a: number };')).toBe('type T = { a: number };');
  });

  it('cuts a sole property to {}', () => {
    expect(cut('type T = { radius: number };')).toBe('type T = {};');
    expect(cut('type T = {\n  radius: number;\n};')).toBe('type T = {};');
    expect(cut('const o = { radius: 1, };')).toBe('const o = {};');
    expect(cut('interface T {\n  radius: number;\n}')).toBe('interface T {}');
  });

  it('cuts whole lines, whichever separator the type literal uses', () => {
    for (const sep of [';', ',', '']) {
      expect(
        cut(`type T = {\n  a: number${sep}\n  radius: number${sep}\n  b: number${sep}\n};`),
      ).toBe(`type T = {\n  a: number${sep}\n  b: number${sep}\n};`);
      expect(cut(`type T = {\n  radius: number${sep}\n  b: number${sep}\n};`)).toBe(
        `type T = {\n  b: number${sep}\n};`,
      );
      expect(cut(`type T = {\n  a: number${sep}\n  radius: number${sep}\n};`)).toBe(
        `type T = {\n  a: number${sep}\n};`,
      );
    }
  });

  it("takes the member's own JSDoc and its trailing comment", () => {
    const text =
      'type T = {\n  a: number;\n  /** Half the width. */\n  radius: number; // metres\n  b: number;\n};';
    expect(cut(text)).toBe('type T = {\n  a: number;\n  b: number;\n};');
  });

  it('keeps a comment that belongs to the previous member', () => {
    const text = 'type T = {\n  // about a\n  a: number;\n\n  radius: number;\n};';
    expect(cut(text)).toBe('type T = {\n  // about a\n  a: number;\n\n};');
  });

  it('cuts one blank line, not two, when the member sat between blank lines', () => {
    const text = 'type T = {\n  a: number;\n\n  radius: number;\n\n  b: number;\n};';
    expect(cut(text)).toBe('type T = {\n  a: number;\n\n  b: number;\n};');
  });

  it('cuts an object-literal property line with its trailing comma and comment', () => {
    const text = 'const o = {\n  a: 1,\n  radius: 2, // r\n  b: 3,\n};';
    expect(cut(text)).toBe('const o = {\n  a: 1,\n  b: 3,\n};');
  });

  it('cuts a JSX attribute with one space', () => {
    expect(cut('const e = <C radius={1} color="x" />;')).toBe('const e = <C color="x" />;');
    expect(cut('const e = <C color="x" radius={1} />;')).toBe('const e = <C color="x" />;');
    expect(cut('const e = <C\n  radius={1}\n  color="x"\n/>;')).toBe(
      'const e = <C\n  color="x"\n/>;',
    );
  });

  it('cuts an assignment statement with its line', () => {
    expect(cut('f();\na.radius = 3;\ng();\n')).toBe('f();\ng();\n');
    expect(cut('f(); a.radius = 3; g();')).toBe('f(); g();');
  });

  it('keeps the module header comment at offset 0', () => {
    expect(cut('/** Header. */\na.radius = 3;\ng();\n')).toBe('/** Header. */\ng();\n');
    expect(cut('// Header.\na.radius = 3;\n')).toBe('// Header.\n');
  });

  it('cuts a string-keyed member', () => {
    expect(cut("type T = { a: number; 'radius': number };")).toBe('type T = { a: number; };');
  });
});
