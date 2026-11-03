/** `1600x1000` as a viewport size in whole CSS pixels; throws on anything else. */
export function parseSize(text: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) throw new Error(`a size is WIDTHxHEIGHT, such as 1600x1000, not "${text}"`);
  return { width: Number(match[1]), height: Number(match[2]) };
}
