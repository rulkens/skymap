import { expect, it } from 'vitest';

import { assertTableNamesBuilt } from '../../../../tools/streams/utils/assertTableNamesBuilt';

it('a table keying only built streams passes; one stale key fails the build by name', () => {
  const built = new Set(['GD-1', 'Pal5']);
  expect(() => assertTableNamesBuilt('stellar-mass', { 'GD-1': 1 }, built)).not.toThrow();
  expect(() => assertTableNamesBuilt('stellar-mass', { 'GD-1': 1, Gd1: 2 }, built)).toThrow(
    /stellar-mass rows name no built stream: Gd1$/,
  );
});
