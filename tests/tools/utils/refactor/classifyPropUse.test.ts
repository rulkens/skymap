import { describe, expect, it } from 'vitest';
import { classifyPropUse } from '../../../../tools/utils/refactor/classifyPropUse';

// Classifies the `nth` occurrence of `radius` in `text`, the way the engine would report it.
function kindOf(text: string, nth = 0, file = 'use.tsx') {
  let start = -1;
  for (let i = 0; i <= nth; i++) start = text.indexOf('radius', start + 1);
  return classifyPropUse(text, { file, start, end: start + 6 });
}

describe('classifyPropUse', () => {
  it('a.radius in an expression is a read', () => {
    expect(kindOf('const r = a.radius * 2;')).toBe('read');
  });

  it('a.radius on the right of an assignment is a read', () => {
    expect(kindOf('b.size = a.radius;')).toBe('read');
    expect(kindOf('a.radius = a.radius;', 1)).toBe('read');
  });

  it('a.radius on the left of = is a write', () => {
    expect(kindOf('a.radius = 3;')).toBe('write');
    expect(kindOf('(a.radius) = 3;')).toBe('write');
  });

  it('compound assignment, ++ and delete are writes', () => {
    expect(kindOf('a.radius += 1;')).toBe('write');
    expect(kindOf('a.radius++;')).toBe('write');
    expect(kindOf('--a.radius;')).toBe('write');
    expect(kindOf('delete a.radius;')).toBe('write');
  });

  it('a.radius in a comparison or a call argument is a read, not a write', () => {
    expect(kindOf('if (a.radius === 1) f(a.radius);')).toBe('read');
    expect(kindOf('const n = -a.radius;')).toBe('read');
  });

  it('a qualified name in a type query is a read', () => {
    expect(kindOf('type T = typeof Ns.radius;')).toBe('read');
  });

  it('an object literal key is a write', () => {
    expect(kindOf('const o = { radius: 1 };')).toBe('write');
    expect(kindOf("const o = { 'radius': 1 };")).toBe('write');
  });

  it('a JSX attribute is a write', () => {
    expect(kindOf('const e = <Circle radius={1} />;')).toBe('write');
  });

  it('a shorthand property is a shorthand-write', () => {
    expect(kindOf('const o = { radius };')).toBe('shorthand-write');
  });

  it('a renamed destructure is a destructure, parameters included', () => {
    expect(kindOf('const { radius: r } = a;')).toBe('destructure');
    expect(kindOf('function f({ radius: r }: Shape) {}')).toBe('destructure');
    expect(kindOf('const f = ({ radius: r = 1 }: Shape) => r;')).toBe('destructure');
    expect(kindOf("const { 'radius': r } = a;")).toBe('destructure');
  });

  it('a destructure assignment takes the property apart', () => {
    expect(kindOf('({ radius: r } = a);')).toBe('destructure');
    expect(kindOf('({ radius } = a);')).toBe('shorthand-destructure');
  });

  it('a plain or defaulted destructure is a shorthand-destructure', () => {
    expect(kindOf('const { radius } = a;')).toBe('shorthand-destructure');
    expect(kindOf('const { radius = 1 } = a;')).toBe('shorthand-destructure');
    expect(kindOf('function f({ radius }: Shape) {}')).toBe('shorthand-destructure');
  });

  it('an element access with either quote style is a string-key', () => {
    expect(kindOf("const x = a['radius'];")).toBe('string-key');
    expect(kindOf('const x = a["radius"];')).toBe('string-key');
  });

  it('an indexed access type is a string-key', () => {
    expect(kindOf("type T = Shape['radius'];")).toBe('string-key');
  });

  it('a shorthand object nested in a value is still a write, not a destructure', () => {
    expect(kindOf('const o = { inner: { radius } };')).toBe('shorthand-write');
  });

  it('a {@link Shape.radius} in a doc comment is a doc-link, not a read', () => {
    expect(kindOf('/** See {@link Shape.radius}. */\nexport const a = 1;')).toBe('doc-link');
    expect(kindOf('class C {\n  /** {@link Shape.radius} */\n  m() {}\n}')).toBe('doc-link');
  });

  it('a template-literal key is a string-key', () => {
    expect(kindOf('const x = a[`radius`];')).toBe('string-key');
  });
});
