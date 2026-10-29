/**
 * The app's slab rows, as `deriveFrameContext` lists them: every Layer's own
 * plus a core row per hostless mesh body. A body named twice draws twice (and
 * `bodyRowSlabs` finds only the first by `hostId`); Layer rows past
 * `LAYER_SLAB_ROW_HEADROOM` throw at boot (`createLayers`).
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { HOSTLESS_MESH_BODIES } from '../../src/data/bodies/hostlessMeshBodies';
import { SCENE_EARTH } from '../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../src/data/bodies/scenePlanets';
import { LAYER_SLAB_ROW_HEADROOM } from '../../src/data/rendering/layerSlabRowHeadroom';
import { bodySlabRowOf } from '../../src/utils/scene/bodySlabRowOf';
import type { SlabRow } from '../../src/@types/engine/frame/SlabRow';

describe('composed slab rows', () => {
  it("the app composition's slab rows name each body once and fit the headroom", () => {
    const layerRows = APP_COMPOSITION.layers.flatMap<SlabRow>((layer) => layer.slabs ?? []);
    const anchorIds = [...layerRows, ...HOSTLESS_MESH_BODIES.map(bodySlabRowOf)].map(
      (row) => row.anchorId as string,
    );

    expect(new Set(anchorIds).size).toBe(anchorIds.length);
    expect(layerRows.length).toBeLessThanOrEqual(LAYER_SLAB_ROW_HEADROOM);
    for (const body of [SCENE_EARTH, ...SCENE_PLANETS]) expect(anchorIds).toContain(body.id);
  });
});
