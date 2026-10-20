import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// Pads the shorter picture with a colour no page uses, so a page that grew or shrank counts as changed.
const PAD = [255, 0, 255, 255] as const;

function padded(png: PNG, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < out.length; i += 4) out.set(PAD, i);
  for (let y = 0; y < png.height; y += 1) {
    png.data.copy(out, y * width * 4, y * png.width * 4, (y + 1) * png.width * 4);
  }
  return out;
}

/** Changed pixels between two PNGs and a PNG marking them, over the larger of the two sizes. */
export function diffScreenshots(
  baseline: Buffer,
  current: Buffer,
): { changed: number; total: number; diff: Buffer } {
  const a = PNG.sync.read(baseline);
  const b = PNG.sync.read(current);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const out = new PNG({ width, height });
  const changed = pixelmatch(
    padded(a, width, height),
    padded(b, width, height),
    out.data,
    width,
    height,
  );
  return { changed, total: width * height, diff: PNG.sync.write(out) };
}
