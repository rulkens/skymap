/** meshAssetRow — one mesh body's row: the request it builds and where its slot commits. */

import { describe, it, expect, vi } from 'vitest';
import { meshAssetRow } from '../../../../src/services/engine/wiring/meshAssetRow';
import { MESH_PRESENTATIONS } from '../../../../src/data/bodies/meshPresentations';
import { MESH_TEXTURE_SLOTS } from '../../../../src/data/mesh/meshTextureSlots';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { meshBodySlotKey } from '../../../../src/utils/meshBodies/meshBodySlotKey';
import { isMeshBody } from '../../../../src/utils/meshBodies/isMeshBody';
import { bodyLayer } from '../../../../src/layers/body/layer';
import { missionsLayer } from '../../../../src/layers/missions/layer';
import { earthScenesLayer } from '../../../../src/layers/earthScenes/layer';
import { probeSpheresLayer } from '../../../../src/layers/probeSpheres/layer';
import type { MeshAsset } from '../../../../src/@types/data/mesh/MeshAsset';

const NO_SINK = { setMesh: () => {}, clearMesh: () => {} };

describe('meshAssetRow', () => {
  it("clamps a mesh body's tier to its tierCeiling", () => {
    // Curiosity ships `small` only, so any app tier above it must still fetch the `small` files.
    const curiosity = MESH_PRESENTATIONS.find((p) => p.id === 'curiosity')!;
    expect(meshAssetRow(NO_SINK, curiosity).req('large')).toEqual({
      meshKey: 'curiosity',
      tier: 'small',
    });
  });

  it("a mesh row's commit and release call the sink with its body id", async () => {
    const asset = Object.fromEntries(
      MESH_TEXTURE_SLOTS.map(({ field }) => [field, { close: () => {} }]),
    ) as unknown as MeshAsset;
    const sink = { setMesh: vi.fn(), clearMesh: vi.fn() };
    const row = meshAssetRow(sink, {
      id: asSceneBodyId('pot'),
      meshKey: 'pot',
      boundingRadiusM: 0.46,
      resolvePx: 3,
      buildMesh: async () => asset,
    });

    await row.slot.load(row.req('small'));
    expect(sink.setMesh).toHaveBeenCalledWith('pot', asset);
    row.slot.release();
    expect(sink.clearMesh).toHaveBeenCalledWith('pot');
  });
});

describe('mesh Layers', () => {
  const MESH_LAYERS = [bodyLayer, missionsLayer, earthScenesLayer, probeSpheresLayer];
  // Enough runtime for every mesh Layer's `assets`; the body Layer's texture rows read the rest.
  const runtime = { meshBodies: NO_SINK, textureSlots: new Map(), atlasSlot: {} } as never;
  const meshKeysOf = (layer: (typeof MESH_LAYERS)[number]) =>
    (layer.assets?.(runtime) ?? [])
      .map((row) => String(row.key))
      .filter((key) => key.startsWith(meshBodySlotKey('')));

  it.each(MESH_LAYERS.map((layer) => [layer.name, layer] as const))(
    'each mesh Layer returns one mesh row per mesh body it declares (%s)',
    (_name, layer) => {
      const declared = (layer.bodies ?? [])
        .filter((row) => isMeshBody(row.body) || row.shapeModel !== undefined)
        .map((row) => meshBodySlotKey(row.body.id));
      expect(declared.length).toBeGreaterThan(0);
      expect(meshKeysOf(layer)).toEqual(declared);
    },
  );

  // A presentation no composed Layer returns a row for would never load its mesh.
  it('together they cover every mesh presentation once', () => {
    const keys = MESH_LAYERS.flatMap(meshKeysOf).sort();
    expect(keys).toEqual(MESH_PRESENTATIONS.map((p) => meshBodySlotKey(p.id)).sort());
  });
});
