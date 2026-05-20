import { describe, it, expectTypeOf } from 'vitest';
import type { Label } from '../../src/@types/rendering/Label';
import type { Vec4 } from '../../src/@types/math/Vec4';

describe('Label type effect fields', () => {
  it('declares optional outlineColor / outlineEmFrac / glowColor / glowEmFrac', () => {
    expectTypeOf<Label['outlineColor']>().toEqualTypeOf<Vec4 | undefined>();
    expectTypeOf<Label['outlineEmFrac']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Label['glowColor']>().toEqualTypeOf<Vec4 | undefined>();
    expectTypeOf<Label['glowEmFrac']>().toEqualTypeOf<number | undefined>();
  });
});
