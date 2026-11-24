import { describe, it, expect } from 'vitest';
import { classifySymbolRef } from '../../../../tools/utils/refactor/classifySymbolRef';

// Classifies the last occurrence of `area` in `line`, the way a reference span would point at it.
function kindOf(line: string, name = 'area') {
  const start = line.lastIndexOf(name);
  return classifySymbolRef(line, { file: '/x.ts', start, end: start + name.length });
}

describe('classifySymbolRef', () => {
  it("classifies an import specifier as 'import'", () => {
    expect(kindOf("import { area } from './shape';")).toBe('import');
  });

  it("classifies a callee as 'call'", () => {
    expect(kindOf('const a = area(2);')).toBe('call');
  });

  it("classifies a `new` callee as 'call'", () => {
    expect(kindOf('const a = new area(2);')).toBe('call');
  });

  it("classifies a type annotation as 'type-position'", () => {
    expect(kindOf('const a: area = 1;')).toBe('type-position');
  });

  it("classifies an `implements` target as 'type-position' and a class `extends` as 'value'", () => {
    expect(kindOf('class A implements area {}')).toBe('type-position');
    expect(kindOf('class A extends area {}')).toBe('value');
  });

  it("classifies `export { x } from` as 're-export'", () => {
    expect(kindOf("export { area } from './shape';")).toBe('re-export');
  });

  it("classifies the left side of a qualified type as 'type-position'", () => {
    expect(kindOf('let x: area.A;')).toBe('type-position');
  });

  it("classifies an alias as 'value'", () => {
    expect(kindOf('const alias = area;')).toBe('value');
  });

  it("classifies a shorthand property as 'value'", () => {
    expect(kindOf('const o = { area };')).toBe('value');
  });
});
