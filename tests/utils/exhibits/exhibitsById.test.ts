import { describe, expect, expectTypeOf, it } from 'vitest';

import { exhibitsById } from '../../../src/utils/exhibits/exhibitsById';
import type { Exhibit } from '../../../src/@types/exhibits/Exhibit';
import type { ExhibitSectionKind } from '../../../src/@types/exhibits/ExhibitSectionKind';

const kind = (hold = false): ExhibitSectionKind<unknown> => ({
  Component: () => null,
  ...(hold && { hold: function* () {} }),
});

const exhibit = (id: string, kinds: ExhibitSectionKind<unknown>[]): Exhibit =>
  ({
    id,
    body: kinds.map((k) => ({ kind: k, data: null })),
  }) as unknown as Exhibit;

describe('exhibitsById', () => {
  it('keys the rows by id', () => {
    const a = exhibit('solarSystem', [kind()]);
    expect(exhibitsById([a]).solarSystem).toBe(a);
  });

  it('throws on a duplicate exhibit id', () => {
    expect(() => exhibitsById([exhibit('solarSystem', []), exhibit('solarSystem', [])])).toThrow(
      /duplicate exhibit id/,
    );
  });

  it('throws on an exhibit with two hold-bearing sections', () => {
    expect(() => exhibitsById([exhibit('solarSystem', [kind(true), kind(true)])])).toThrow(
      /more than one hold/,
    );
  });

  it('keeps the keys literal, so ExhibitId can be derived from the rows', () => {
    const a = { id: 'a', body: [] } as unknown as Exhibit<'a'>;
    const b = { id: 'b', body: [] } as unknown as Exhibit<'b'>;
    const byId = exhibitsById([a, b]);
    expectTypeOf<keyof typeof byId>().toEqualTypeOf<'a' | 'b'>();
    expect(Object.keys(byId)).toEqual(['a', 'b']);
  });
});
