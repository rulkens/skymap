/** An SVG document as a CSS `url()`; percent-encoded so `#` (colours, fragment refs) survives. */
export function svgDataUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
