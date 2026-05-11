/**
 * Type-only smoke test for the Vec/Mat tuple aliases.  Vitest runs this
 * file like any other test — but the `expectTypeOf` calls are checked
 * by the TS compiler, not at runtime.  A wrong tuple length here is a
 * typecheck failure, not a runtime failure.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Vec2, Vec3, Vec4 } from '../../src/@types/Vec';
import type { Mat3, Mat4 } from '../../src/@types/Mat';

describe('Vec tuple aliases', () => {
  it('Vec2 is a 2-element tuple of number', () => {
    expectTypeOf<Vec2>().toEqualTypeOf<[number, number]>();
  });
  it('Vec3 is a 3-element tuple of number', () => {
    expectTypeOf<Vec3>().toEqualTypeOf<[number, number, number]>();
  });
  it('Vec4 is a 4-element tuple of number', () => {
    expectTypeOf<Vec4>().toEqualTypeOf<[number, number, number, number]>();
  });
});

describe('Mat tuple aliases', () => {
  it('Mat3 is a 9-element mutable tuple of number', () => {
    expectTypeOf<Mat3>().toEqualTypeOf<
      [
        number, number, number,
        number, number, number,
        number, number, number,
      ]
    >();
  });
  it('Mat4 is a 16-element mutable tuple of number', () => {
    expectTypeOf<Mat4>().toEqualTypeOf<
      [
        number, number, number, number,
        number, number, number, number,
        number, number, number, number,
        number, number, number, number,
      ]
    >();
  });
});
