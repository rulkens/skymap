/**
 * FadeLayer — compile-time assignability check.
 *
 * Confirms three contracts of `FadeLayer<Item>` that Plan A depends on:
 *   1. The intent fields (`intent`/`writeIntent`/`post`/`guard`) are
 *      optional — a row with ONLY `key`/`expand`/`handle`/`seed`
 *      typechecks. If any intent field becomes required, this literal
 *      stops compiling.
 *   2. `handle` returns a `FadeId` (its result is assigned to a
 *      `FadeId`-typed const).
 *   3. `seed` returns a `number`.
 *
 * Purely compile-time: if `FadeLayer` drifts from its spec (a required
 * field is renamed, an optional field becomes required, a return type
 * changes), this file stops compiling and the typecheck gate catches it.
 * No GPU factories are imported; the `Item` is `void` and the row's
 * closures ignore their state/settings args.
 */

import { describe, expect, it } from 'vitest';
import type { FadeLayer } from '../../../src/@types/animation/FadeLayer';
import type { FadeId } from '../../../src/@types/animation/FadeId';

// A singleton layer: `Item = void`, so `expand` returns a one-element
// array and `handle` maps to the discriminator-free `milkyWay` FadeId.
const milkyWayDiskRow: FadeLayer<void> = {
  key: 'milkyWayDisk',
  expand: (_state) => [undefined],
  handle: (_item) => ({ kind: 'milkyWay' }),
  seed: (_settings, _item) => 1,
};

describe('FadeLayer assignability', () => {
  it('accepts a register-only row (intent fields omitted)', () => {
    expect(milkyWayDiskRow).toBeDefined();
  });

  it('handle returns a FadeId', () => {
    const id: FadeId = milkyWayDiskRow.handle(undefined);
    expect(id.kind).toBe('milkyWay');
  });

  it('seed returns a number', () => {
    const opacity: number = milkyWayDiskRow.seed({} as never, undefined);
    expect(opacity).toBe(1);
  });
});
