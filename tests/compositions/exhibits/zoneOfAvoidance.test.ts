/**
 * The zone-of-avoidance stop's copy talks only about the band and the galaxies behind it, so any
 * other kind a click reaches opens a card the copy never mentions. Every composed kind gets one
 * stub pick, so a kind added to the app later must be named in the exhibit's off list or fail here.
 * Earth scenes keep their real row: it has no pick surface, so the list need not name it.
 */

import { describe, expect, it } from 'vitest';
import { zoneOfAvoidance } from '../../../src/compositions/exhibits/zoneOfAvoidance';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { layerSelectionKinds } from '../../../src/utils/layer/layerSelectionKinds';
import { earthSceneSelectionRow } from '../../../src/layers/earthScenes/scenes/present/earthSceneSelectionRow';
import type { SelectionKindRow } from '../../../src/@types/engine/layer/SelectionKindRow';

const types = layerSelectionKinds(APP_COMPOSITION.layers).map((kind) => kind.type);
const rows = types.map((type, code) =>
  type === 'earthScene'
    ? earthSceneSelectionRow()
    : ({ type, pickSources: [code], resolvePick: () => ({ type }) } as unknown as SelectionKindRow),
);

describe('zoneOfAvoidance exhibit', () => {
  it('leaves only galaxies and the shell pickable', () => {
    const off = zoneOfAvoidance.settings!.picking!.off;
    const resolver = composeSelectionRows(
      () => rows,
      () => off,
    );
    const pickable = types.filter(
      (_, code) => resolver.resolvePick({ sourceCode: code, localIdx: 0 }) !== null,
    );
    expect(pickable.sort()).toEqual(['galaxyCatalog', 'zoneOfAvoidance']);
  });
});
