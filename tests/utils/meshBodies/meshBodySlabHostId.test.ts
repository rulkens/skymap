/**
 * All three branches read the REAL driver tables: the whale's `earth` focus owns
 * a slab row, Voyager 1 hangs off the rowless Sun, and Mars owns its own row.
 */

import { describe, expect, it } from 'vitest';

import { meshBodySlabHostId } from '../../../src/utils/meshBodies/meshBodySlabHostId';

describe('meshBodySlabHostId', () => {
  it('routes to the host row when the host owns one', () => {
    expect(meshBodySlabHostId('whale')).toBe('earth');
  });

  it('routes to the body itself when its host owns no slab row', () => {
    expect(meshBodySlabHostId('voyager1')).toBe('voyager1');
  });

  it('keeps a body that owns a row on its own row, not its host’s', () => {
    expect(meshBodySlabHostId('phobos')).toBe('phobos');
  });
});
