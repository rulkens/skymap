/** A sitemap listing `urls` as given: no `changefreq` or `priority`, which Google ignores. */
export function sitemapXml(urls: readonly string[]): string {
  const rows = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}
