import type { InkWearParams } from '../../@types/ui/antiqueChrome/InkWearParams';
import { svgNumber as f } from './svgNumber';

/**
 * Reprints a generated chrome SVG with uneven ink: lines shift slightly off true and
 * the ink take thins, now and then to a break. Seeded, so a token is identical on
 * every load. A 9-slice tiles its edge from one short strip, where a wobble would
 * repeat and kink at every seam, so `calm` rects (the edge strips) keep the take
 * but not the wobble. Light fills (grounds, washes) keep their full take: only ink
 * breaks. The filter renders inside the image, rasterised once per size.
 */
export function inkWearSvg(
  svg: string,
  w: InkWearParams,
  seed: number,
  calm: readonly (readonly [number, number, number, number])[] = [],
): string {
  // Mid-grey reads as "no displacement" to feDisplacementMap.
  const floods = calm
    .map(
      ([x, y, cw, ch], i) =>
        `<feFlood flood-color="#808080" x="${f(x)}" y="${f(y)}" width="${f(cw)}" height="${f(ch)}" result="c${i}"/>`,
    )
    .join('');
  const merge = calm.length
    ? `${floods}<feMerge result="m"><feMergeNode in="n"/>${calm.map((_, i) => `<feMergeNode in="c${i}"/>`).join('')}</feMerge>`
    : '';
  const k = 1 / w.breakSpan;
  const filter =
    `<filter id="wear" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${f(w.wobbleFrequency)}" numOctaves="2" seed="${seed}" result="n"/>${merge}` +
    `<feDisplacementMap in="SourceGraphic" in2="${calm.length ? 'm' : 'n'}" scale="${f(w.wobble)}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    // Alpha 3·luma − 1: opaque from paper down to a verdigris wash, none on ink.
    `<feColorMatrix in="d" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 1.77 .33 0 -1" result="paper"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="${f(w.grain)}" numOctaves="2" seed="${seed + 1}"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${f(-k)} 0 0 0 ${f(1 + k * w.thinAt)}" result="take"/>` +
    `<feMerge result="keep"><feMergeNode in="take"/><feMergeNode in="paper"/></feMerge>` +
    `<feComposite in="d" in2="keep" operator="in"/></filter>`;
  const open = svg.indexOf('>') + 1;
  const close = svg.lastIndexOf('</svg>');
  return `${svg.slice(0, open)}<defs>${filter}</defs><g filter="url(#wear)">${svg.slice(open, close)}</g></svg>`;
}
