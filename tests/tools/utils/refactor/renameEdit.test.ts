import { describe, expect, it } from 'vitest';
import { renameEdit } from '../../../../tools/utils/refactor/renameEdit';

// Each case renames the first `foo` after `marker`, the way the engine's span would point at it.
function apply(text: string, marker: string, newName = 'bar'): string {
  const start = text.indexOf('foo', text.indexOf(marker));
  const edit = renameEdit(text, { file: '/x.ts', start, end: start + 3 }, newName);
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}

describe('renameEdit', () => {
  it('replaces a plain identifier', () => {
    expect(apply('export const y = foo + 1;', 'y =')).toBe('export const y = bar + 1;');
  });

  it('turns an object shorthand into key: value', () => {
    expect(apply('export const o = { foo };', '{')).toBe('export const o = { foo: bar };');
  });

  it('replaces an import specifier', () => {
    expect(apply("import { foo } from './a';", 'import')).toBe("import { bar } from './a';");
  });

  it('replaces only the imported name of an aliased import', () => {
    expect(apply("import { foo as local } from './a';", 'import')).toBe(
      "import { bar as local } from './a';",
    );
  });

  it('replaces an export specifier, aliased or not', () => {
    expect(apply('export { foo };', 'export')).toBe('export { bar };');
    expect(apply("export { foo as other } from './a';", 'export')).toBe(
      "export { bar as other } from './a';",
    );
  });
});
