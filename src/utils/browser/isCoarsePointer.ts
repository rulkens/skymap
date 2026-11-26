/**
 * True when the primary pointer is coarse (a touchscreen): phones and tablets. False where
 * there is no `window` or `matchMedia` (workers, tests), the same guard as `initGpu`'s HDR read.
 */
export function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches
  );
}
