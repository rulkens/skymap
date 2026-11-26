export function cssVar(el: Element, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}
