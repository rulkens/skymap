/**
 * Type-only smoke test for the Vec/Mat tuple aliases.  Vitest runs this
 * file like any other test — but the `expectTypeOf` calls are checked
 * by the TS compiler, not at runtime.  A wrong tuple length here is a
 * typecheck failure, not a runtime failure.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Vec2, Vec3, Vec4 } from '../../src/@types/Vec';

describe('Vec tuple aliases', () => {
  it('Vec2 is a 2-element tuple of number', () => {
    expectTypeOf<Vec2>().toEqualTypeOf<readonly [number, number]>();
  });
  it('Vec3 is a 3-element tuple of number', () => {
    expectTypeOf<Vec3>().toEqualTypeOf<readonly [number, number, number]>();
  });
  it('Vec4 is a 4-element tuple of number', () => {
    expectTypeOf<Vec4>().toEqualTypeOf<readonly [number, number, number, number]>();
  });
});
