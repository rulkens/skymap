import type { TextureKind } from '../../@types/data/TextureKind';
import { isGreyTextureKind } from './isGreyTextureKind';
import { isLinearTextureKind } from './isLinearTextureKind';

/**
 * bodyTextureFormat — the one GPU format per texture kind, so a placeholder and
 * the real map it stands in for can never disagree. A grey kind is one raw
 * channel (the shader derives colour); a linear kind packs numeric fields; the
 * rest are sRGB colour, linearised by the sampler.
 */
export function bodyTextureFormat(kind: TextureKind): GPUTextureFormat {
  if (isGreyTextureKind(kind)) return 'r8unorm';
  return isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
}
