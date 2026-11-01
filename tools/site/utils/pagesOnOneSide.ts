/** A line for every page that only one of the two builds has; empty when they agree. */
export function pagesOnOneSide(baseline: string[], current: string[]): string[] {
  const inBaseline = new Set(baseline);
  const inCurrent = new Set(current);
  return [
    ...baseline.filter((page) => !inCurrent.has(page)).map((page) => `${page}  only in baseline`),
    ...current.filter((page) => !inBaseline.has(page)).map((page) => `${page}  only in current`),
  ];
}
