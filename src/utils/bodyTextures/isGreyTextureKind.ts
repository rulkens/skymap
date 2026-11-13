import type { TextureKind } from '../../@types/data/TextureKind';

/**
 * isGreyTextureKind — the kinds that ship as one grey channel and are sampled
 * raw (`clouds`): the byte is the coverage, and the shader derives the sRGB
 * colour from it. Orthogonal to `isLinearTextureKind`, whose maps pack several
 * numeric fields. The predicate picks the WebP name with a `-grey` segment
 * (`bodyTextureFilename`), the `r8unorm` format (`bodyTextureFormat`) and the
 * raw decode in the fetcher.
 */
export function isGreyTextureKind(kind: TextureKind): boolean {
  return kind === 'clouds';
}
