/**
 * outerRadiusOf — the single home of the galaxy's outer-radius formula:
 * `10 * (params.radius || 1)`, the spike's fixed base scale that every other
 * length (disk scale, bulge, bar, dust ring, ...) derives from. It lived
 * inline in both `packGenerationUniforms` and `carveDustLayout`, so a tweak to
 * the ratio had to be made in two places or silently desync the packer from
 * the carve. Extracting it makes the derivation one edit, one authority.
 */
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';

export function outerRadiusOf(params: GalaxyParams): number {
  return 10 * (params.shared.radius || 1);
}
