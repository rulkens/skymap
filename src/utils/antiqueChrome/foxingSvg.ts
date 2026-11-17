import type { FoxingParams } from '../../@types/ui/antiqueChrome/FoxingParams';
import { mulberry32 } from '../random/mulberry32';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

/**
 * A sheet of foxing, seeded: rust spots (a dark core in a soft halo, edges roughened)
 * and one faint tide-line. Laid larger than any panel and positioned by percentage,
 * its offset follows the panel's own size, so no two panels show the same spots.
 */
export function foxingSvg(p: FoxingParams, seed: number): string {
  const rnd = mulberry32(seed);
  let spots = '';
  for (let i = 0; i < p.spots; i++) {
    const x = f(rnd() * p.width);
    const y = f(rnd() * p.height);
    const s = 0.35 + 0.65 * rnd();
    spots +=
      `<circle cx="${x}" cy="${y}" r="${f((p.halo / 2) * s)}" fill="url(#h)"/>` +
      `<circle cx="${x}" cy="${y}" r="${f((p.core / 2) * s)}" fill="${p.tone}" fill-opacity="${f(p.coreAlpha * (0.5 + 0.5 * rnd()))}"/>`;
  }
  const cx = f(p.width * (0.2 + 0.6 * rnd()));
  const cy = f(p.height * (0.2 + 0.6 * rnd()));
  const rx = f(p.width * (0.15 + 0.1 * rnd()));
  const ry = f(p.height * (0.12 + 0.1 * rnd()));
  return svgDocument(
    p.width,
    p.height,
    `<defs><radialGradient id="h"><stop offset="0" stop-color="${p.tone}" stop-opacity="${f(p.haloAlpha)}"/>` +
      `<stop offset="1" stop-color="${p.tone}" stop-opacity="0"/></radialGradient>` +
      `<filter id="r" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="${seed}"/>` +
      `<feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter></defs>` +
      `<g filter="url(#r)">${spots}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${p.tone}" stroke-opacity="${f(p.tideAlpha)}" stroke-width="2.5"/></g>`,
  );
}
