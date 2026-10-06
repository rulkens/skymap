/**
 * The privacy page's line: how many files the browser fetched for the page and
 * which hosts they came from, from the `urls` of its own resource timings. It
 * names whatever hosts it finds, so it stays true if one is not ours.
 */
export function filesFetchedLine(urls: readonly string[]): string {
  const hosts = [...new Set(urls.map((url) => new URL(url).hostname))].sort();
  const from = hosts.length > 1 ? `${hosts.slice(0, -1).join(', ')} and ${hosts.at(-1)}` : hosts[0];
  const files = urls.length === 1 ? '1 file' : `${urls.length.toLocaleString('en-GB')} files`;
  return `Your browser has fetched ${files} to show you this page, all from ${from}. It did the counting, and we never see the result.`;
}
