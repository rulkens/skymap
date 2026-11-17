import sharp, { type OverlayOptions } from 'sharp';

const SHEET_WIDTH = 1920;
const TILE_HEIGHT = 240;
// Wide enough for a label under an upright cut-out, narrow enough that a banner leaves room for neighbours.
const TILE_MIN = 280;
const TILE_MAX = 640;
const LABEL_HEIGHT = 44;
const GAP = 16;
const CHAR_PX = 7.4;

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One PNG of pictures as displayed, in the given order, each scaled to one height and labelled
 * below (`title`, then `note`, in red when `alarm`), so neighbours' framing and light compare at a
 * glance.
 */
export async function makeContactSheet(
  tiles: readonly { png: Buffer; title: string; note: string; alarm: boolean }[],
  file: string,
): Promise<void> {
  const placed: OverlayOptions[] = [];
  let x = GAP;
  let y = GAP;
  for (const tile of tiles) {
    const { width = 1, height = 1 } = await sharp(tile.png).metadata();
    const w = Math.min(TILE_MAX, Math.max(TILE_MIN, Math.round((TILE_HEIGHT * width) / height)));
    if (x + w > SHEET_WIDTH - GAP) {
      x = GAP;
      y += TILE_HEIGHT + LABEL_HEIGHT + GAP;
    }
    const picture = await sharp(tile.png)
      .resize({ width: w, height: TILE_HEIGHT, fit: 'contain', background: '#000' })
      .png()
      .toBuffer();
    const fit = (text: string) => escape(text.slice(0, Math.floor((w - 8) / CHAR_PX)));
    const label = Buffer.from(
      `<svg width="${w}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" font-size="13">` +
        `<text x="4" y="17" fill="#eeeeee" font-weight="bold">${fit(tile.title)}</text>` +
        `<text x="4" y="36" fill="${tile.alarm ? '#ff7a59' : '#9a9a9a'}">${fit(tile.note)}</text></svg>`,
    );
    placed.push(
      { input: picture, left: x, top: y },
      { input: label, left: x, top: y + TILE_HEIGHT },
    );
    x += w + GAP;
  }
  const sheetHeight = y + TILE_HEIGHT + LABEL_HEIGHT + GAP;
  await sharp({
    create: { width: SHEET_WIDTH, height: sheetHeight, channels: 3, background: '#181818' },
  })
    .composite(placed)
    .png()
    .toFile(file);
}
