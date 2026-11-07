/**
 * loadAntiqueSheetAssets — starts fetching the look's static images (paper
 * tile and stains, ornament atlas) and setting its digits, and returns a live
 * view of them that fills in as each lands. `onLanded` fires per asset: the
 * render loop may be asleep at rest, and an asset landing is a reason to draw;
 * the paper also invalidates the baked sheet. A failure leaves that asset null
 * and the plate draws without it. Anything landing after `destroy` is dropped.
 */

import type { AntiqueSheetAssets } from '../../../../@types/rendering/AntiqueSheetAssets';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { buildAntiqueGlyphSheet } from '../../../../utils/gpu/antiqueLook/buildAntiqueGlyphSheet';
import { fetchAntiqueBitmap } from '../../../../utils/gpu/antiqueLook/fetchAntiqueBitmap';

export function loadAntiqueSheetAssets(
  device: GPUDevice,
  onLanded: (asset: 'paper' | 'ornaments' | 'glyphs') => void,
): AntiqueSheetAssets {
  let paper: AntiqueSheetAssets['paper'] = null;
  let ornaments: AntiqueSheetAssets['ornaments'] = null;
  let glyphs: AntiqueSheetAssets['glyphs'] = null;
  let destroyed = false;
  const textures: GPUTexture[] = [];

  const upload = (label: string, bitmap: ImageBitmap, mips = false): GPUTextureView => {
    const texture = device.createTexture({
      label,
      size: [bitmap.width, bitmap.height],
      mipLevelCount: mips ? mipLevelCount(bitmap.width, bitmap.height) : 1,
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
      bitmap.width,
      bitmap.height,
    ]);
    bitmap.close();
    generateMipChain(device, texture);
    textures.push(texture);
    return texture.createView();
  };
  const stillWanted = (...bitmaps: ImageBitmap[]): boolean => {
    if (destroyed) bitmaps.forEach((bitmap) => bitmap.close());
    return !destroyed;
  };
  const warn = (what: string) => (error: unknown) =>
    console.warn(`antique look: ${what} unavailable`, error);

  Promise.all([fetchAntiqueBitmap('paper.webp'), fetchAntiqueBitmap('stains.webp')])
    .then(([tile, stains]) => {
      if (!stillWanted(tile, stains)) return;
      paper = {
        tile: upload('antique-look-paper-tile', tile),
        stains: upload('antique-look-stains', stains),
      };
      onLanded('paper');
    })
    .catch(warn('scanned paper'));
  fetchAntiqueBitmap('ornaments.png')
    .then((bitmap) => {
      if (!stillWanted(bitmap)) return;
      // Mipped: a constellation figure prints its lines as the chain's coverage.
      ornaments = upload('antique-look-ornament-atlas', bitmap, true);
      onLanded('ornaments');
    })
    .catch(warn('ornaments'));
  buildAntiqueGlyphSheet()
    .then(({ bitmap, width, height, glyphs: rects }) => {
      if (!stillWanted(bitmap)) return;
      glyphs = {
        view: upload('antique-look-glyph-sheet', bitmap),
        sheet: { width, height, glyphs: rects },
      };
      onLanded('glyphs');
    })
    .catch(warn('border numbering'));

  return {
    get paper() {
      return paper;
    },
    get ornaments() {
      return ornaments;
    },
    get glyphs() {
      return glyphs;
    },
    destroy() {
      destroyed = true;
      paper = ornaments = glyphs = null;
      textures.forEach((texture) => texture.destroy());
    },
  };
}
