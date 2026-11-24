import { describe, expect, it } from 'vitest';
import { classifyPropUse } from '../../../../tools/utils/refactor/classifyPropUse';
import { propRenameEdit } from '../../../../tools/utils/refactor/propRenameEdit';

// Applies the edit for the first `radius` of `text`, classified the way the driver does.
function renamed(text: string): string {
  const start = text.indexOf('radius');
  const at = { file: 'use.tsx', start, end: start + 6 };
  const edit = propRenameEdit(text, { at, kind: classifyPropUse(text, at) }, 'size');
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}

describe('propRenameEdit', () => {
  it('replaces the name of a read', () => {
    expect(renamed('const r = a.radius;')).toBe('const r = a.size;');
  });

  it('replaces a JSX attribute name', () => {
    expect(renamed('const e = <Circle radius={1} />;')).toBe('const e = <Circle size={1} />;');
  });

  it('keeps the local of a shorthand write', () => {
    expect(renamed('const o = { radius };')).toBe('const o = { size: radius };');
  });

  it('keeps the local of a shorthand destructure', () => {
    expect(renamed('const { radius } = a;')).toBe('const { size: radius } = a;');
  });

  it('keeps the local and the default of a shorthand destructure with a default', () => {
    expect(renamed('const { radius = 1 } = a;')).toBe('const { size: radius = 1 } = a;');
  });

  it('keeps the quotes of a string key, whichever kind', () => {
    expect(renamed("const x = a['radius'];")).toBe("const x = a['size'];");
    expect(renamed('const x = a["radius"];')).toBe('const x = a["size"];');
  });

  it('renames only the key of a renamed destructure', () => {
    expect(renamed('const { radius: r } = a;')).toBe('const { size: r } = a;');
  });
});
