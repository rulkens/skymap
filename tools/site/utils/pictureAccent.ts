import sharp from 'sharp';

const HUE_BINS = 24;
// The accent is set light, so it reads at 4.5:1 or better on black whatever its hue.
const LIGHTNESS = 0.74;
// Where a picture's subject usually is: the middle, a little low (a landscape's ground, not its sky).
const SUBJECT_Y = 0.58;

const hex = (h: number, s: number, l: number): string => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * The colour of a picture's subject: the band of hues (three neighbouring bins, 45°) that carries the most
 * saturation near the subject's place, at that band's mean hue and saturation (strengthened, since a small
 * colour reads paler than a large field of it), lightened to a text colour for a dark ground. Black space,
 * white highlights and grey carry no weight, so a grey subject keeps only a faint tint.
 */
export async function pictureAccent(file: string): Promise<string> {
  const { data, info } = await sharp(file)
    .resize(96, 54, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const weight = new Float64Array(HUE_BINS);
  const satSum = new Float64Array(HUE_BINS);
  for (let p = 0; p < info.width * info.height; p++) {
    const [r, g, b] = [data[3 * p]! / 255, data[3 * p + 1]! / 255, data[3 * p + 2]! / 255];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (l < 0.08 || l > 0.92 || max === min) continue;
    const s = (max - min) / (1 - Math.abs(2 * l - 1));
    const h =
      max === r
        ? (((g - b) / (max - min)) % 6) * 60
        : max === g
          ? ((b - r) / (max - min) + 2) * 60
          : ((r - g) / (max - min) + 4) * 60;
    const x = (p % info.width) / info.width - 0.5;
    const y = Math.floor(p / info.width) / info.height - SUBJECT_Y;
    const w = s * Math.exp(-(x * x) / 0.06 - (y * y) / 0.03);
    const bin = Math.floor((((h % 360) + 360) % 360) / (360 / HUE_BINS));
    weight[bin]! += w;
    satSum[bin]! += s * w;
  }
  const band = (i: number) => [i - 1, i, i + 1].map((j) => (j + HUE_BINS) % HUE_BINS);
  const sums = Array.from(weight, (_, i) => band(i).reduce((sum, j) => sum + weight[j]!, 0));
  const best = sums.indexOf(Math.max(...sums));
  const total = sums[best]!;
  if (total === 0) return hex(0, 0, LIGHTNESS);
  const hue = band(best).reduce((sum, j, k) => sum + weight[j]! * (best + k - 0.5), 0) * (360 / HUE_BINS) / total;
  const saturation = band(best).reduce((sum, j) => sum + satSum[j]!, 0) / total;
  return hex((hue + 360) % 360, Math.min(0.75, Math.max(0.12, saturation * 1.8)), LIGHTNESS);
}
