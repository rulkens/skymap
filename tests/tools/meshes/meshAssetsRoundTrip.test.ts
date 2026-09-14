import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MESH_ASSETS } from '../../../src/data/bodies/meshAssets.generated';
import { serializeMeshAssets } from '../../../tools/meshes/buildMeshes';

const GENERATED_PATH = fileURLToPath(
  new URL('../../../src/data/bodies/meshAssets.generated.ts', import.meta.url),
);

// A generator/artifact contract: the committed table has to stay byte-identical
// to what a bake would write, or the next bake's diff carries an unrelated
// hand edit — or a serializer change nobody rebaked for.
describe('serializeMeshAssets()', () => {
  it('the committed generated table is exactly what serializeMeshAssets emits for its own rows', () => {
    expect(serializeMeshAssets(Object.values(MESH_ASSETS))).toBe(
      readFileSync(GENERATED_PATH, 'utf8'),
    );
  });
});
