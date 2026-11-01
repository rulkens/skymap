const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The view a key moves a gallery's markers to from view `at`, or `at` itself when the key is not one of theirs. */
export function galleryKeyTarget(key: string, at: number, last: number): number {
  return key === 'Home' ? 0 : key === 'End' ? last : at + (STEPS[key] ?? 0);
}
