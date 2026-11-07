import { svgDataUri } from './svgDataUri';

/** An SVG document as a CSS `url()`. */
export function svgDataUrl(svg: string): string {
  return `url("${svgDataUri(svg)}")`;
}
