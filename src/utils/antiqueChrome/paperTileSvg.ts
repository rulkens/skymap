import type { PaperParams } from '../../@types/ui/antiqueChrome/PaperParams';
import type { HexString } from '../../@types/math/HexString';
import { paperNoiseFilter } from './paperNoiseFilter';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

/**
 * One seamless tile of laid paper as an overlay for the `ground` colour: rag
 * fibre, slow toning and the mould's wire and chain lines. Turbulence is stitched to
 * the tile, so it repeats without a seam; the image rasterises once per size, never
 * per repaint as a live CSS filter would.
 */
export function paperTileSvg(p: PaperParams, ground: HexString, seed: number): string {
  const S = p.size;
  const fibre = `${f(p.grain)} ${f(p.grain * 0.45)}`;
  let wires = '';
  for (let y = p.wirePitch / 2; y < S; y += p.wirePitch) wires += `M0 ${f(y)}H${S}`;
  let chains = '';
  for (let x = p.chainPitch / 2; x < S; x += p.chainPitch) chains += `M${f(x)} 0V${S}`;
  return svgDocument(
    S,
    S,
    `<defs>${paperNoiseFilter('m', f(p.mottle), seed, S, ground, p.tone, p.mottleStrength, true)}${paperNoiseFilter('g', fibre, seed + 1, S, ground, p.tone, p.grainStrength, true)}</defs>` +
      `<rect width="${S}" height="${S}" filter="url(#m)"/><rect width="${S}" height="${S}" filter="url(#g)"/>` +
      `<path d="${wires}" stroke="${p.tone}" stroke-opacity="${f(p.wireAlpha)}" stroke-width=".6"/>` +
      `<path d="${chains}" stroke="${p.tone}" stroke-opacity="${f(p.chainAlpha)}" stroke-width="1.6"/>`,
  );
}
