import { svgNumber } from './svgNumber';

/** A standalone SVG document `w` × `h` CSS px, one user unit per px, ready for `svgDataUrl`. */
export function svgDocument(w: number, h: number, body: string): string {
  const W = svgNumber(w);
  const H = svgNumber(h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}
