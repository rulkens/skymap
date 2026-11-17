/** An SVG document as a `data:` URI (for an `href`); percent-encoded so `#` (colours, fragment refs) survives. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
