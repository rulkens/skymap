import { describe, it, expect, vi } from 'vitest';
import { closeMeshAssetBitmaps } from '../../../src/utils/meshBodies/closeMeshAssetBitmaps';
import { MESH_TEXTURE_SLOTS } from '../../../src/data/mesh/meshTextureSlots';
import type { MeshAsset } from '../../../src/@types/data/mesh/MeshAsset';

// The decal sits outside `MESH_TEXTURE_SLOTS`, so it is the one a loop over the
// texture table alone would leave decoded.
describe('closeMeshAssetBitmaps', () => {
  it('closes every texture slot and the contact-shadow decal', () => {
    const bitmap = () => ({ close: vi.fn() });
    const textures = Object.fromEntries(MESH_TEXTURE_SLOTS.map(({ field }) => [field, bitmap()]));
    const contactShadow = bitmap();
    const asset = { ...textures, contactShadow } as unknown as MeshAsset;

    closeMeshAssetBitmaps(asset);

    for (const texture of Object.values(textures)) expect(texture.close).toHaveBeenCalledOnce();
    expect(contactShadow.close).toHaveBeenCalledOnce();
  });
});
