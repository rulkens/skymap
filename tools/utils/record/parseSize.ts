/**
 * parseSize — turn a recorder CLI '--size' argument ('3840x2160') into pixel
 * dimensions.
 *
 * The separator is a literal lowercase 'x', not '×' or ',' — matching how
 * ffmpeg's own `-s`/scale filters and every common resolution shorthand
 * ("1920x1080") are written, so an operator can copy a resolution string
 * straight from ffmpeg docs without translating the separator.
 */
export function parseSize(raw: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(raw.trim());
  if (match === null) {
    throw new Error(`parseSize: malformed size '${raw}' — expected 'WIDTHxHEIGHT'`);
  }
  const widthStr = match[1];
  const heightStr = match[2];
  if (widthStr === undefined || heightStr === undefined) {
    throw new Error(`parseSize: malformed size '${raw}' — expected 'WIDTHxHEIGHT'`);
  }
  const width = Number(widthStr);
  const height = Number(heightStr);
  if (width <= 0 || height <= 0) {
    throw new Error(`parseSize: non-positive dimension in '${raw}'`);
  }
  return { width, height };
}
