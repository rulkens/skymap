/**
 * loadAntiqueSheetAssets — starts fetching the look's static images (paper
 * tile and stains, ornament atlas) and setting its digits, and returns a live
 * view of them that fills in as each lands. `onLanded` fires per asset: the
 * render loop may be asleep at rest, and an asset landing is a reason to draw;
 * the paper also invalidates the baked sheet. A failure leaves that asset null
 * and the plate draws without it.
 */

import type { AntiqueSheetAssets } from '../../../../@types/rendering/AntiqueSheetAssets';
import { buildAntiqueGlyphSheet } from '../../../../utils/gpu/antiqueLook/buildAntiqueGlyphSheet';
import { fetchAntiqueBitmap } from '../../../../utils/gpu/antiqueLook/fetchAntiqueBitmap';

export function loadAntiqueSheetAssets(
  device: GPUDevice,
  onLanded: (asset: 'paper' | 'ornaments' | 'glyphs') => void,
): AntiqueSheetAssets {
  let paper: AntiqueSheetAssets['paper'] = null;
  let ornaments: AntiqueSheetAssets['ornaments'] = null;
  let glyphs: AntiqueSheetAssets['glyphs'] = null;

  const upload = (label: string, bitmap: ImageBitmap): GPUTexture => {
    const texture = device.createTexture({
      label,
      size: [bitmap.width, bitmap.height],
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
    return texture;
  };
  const warn = (what: string) => (error: unknown) =>
    console.warn(`antique look: ${what} unavailable`, error);

  Promise.all([fetchAntiqueBitmap('paper.webp'), fetchAntiqueBitmap('stains.webp')])
    .then(([tile, stains]) => {
      paper = {
        tile: upload('antique-look-paper-tile', tile),
        stains: upload('antique-look-stains', stains),
      };
      onLanded('paper');
    })
    .catch(warn('scanned paper'));
  fetchAntiqueBitmap('ornaments.png')
    .then((bitmap) => {
      ornaments = upload('antique-look-ornament-atlas', bitmap);
      onLanded('ornaments');
    })
    .catch(warn('ornaments'));
  buildAntiqueGlyphSheet()
    .then((sheet) => {
      glyphs = { texture: upload('antique-look-glyph-sheet', sheet.bitmap), sheet };
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
      paper?.tile.destroy();
      paper?.stains.destroy();
      ornaments?.destroy();
      glyphs?.texture.destroy();
    },
  };
}
