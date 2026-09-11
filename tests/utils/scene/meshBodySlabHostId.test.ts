/**
 * Both branches read the REAL driver tables, so the fixtures borrow ids that
 * already have a driver row: the whale's `earth` focus owns a slab row, while
 * a Sun-focused body's does not. Task 11's Voyagers are the first real rows of
 * the second kind; `pluto`'s driver stands in for them until then.
 */

import { describe, expect, it } from 'vitest';

import type { MeshBody } from '../../../src/@types/scene/MeshBody';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { meshBodySlabHostId } from '../../../src/utils/scene/meshBodySlabHostId';

const whale = SCENE_MESH_BODIES.find((body) => body.id === 'whale')!;

describe('meshBodySlabHostId', () => {
  it('routes to the host row when the host owns one', () => {
    expect(meshBodySlabHostId(whale)).toBe('earth');
  });

  it('routes to the body itself when its host owns no slab row', () => {
    const sunFocused: MeshBody = { ...whale, id: 'pluto' };
    expect(meshBodySlabHostId(sunFocused)).toBe('pluto');
  });
});
