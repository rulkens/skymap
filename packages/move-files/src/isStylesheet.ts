/** CSS the rewrite understands. Sass and Less resolve `@use` and partials their own way: guard only. */
export function isStylesheet(path: string): boolean {
  return /\.(?:css|pcss)$/.test(path);
}
