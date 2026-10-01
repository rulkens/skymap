/**
 * afterTwoFrames — resolves once two animation frames have run. The render
 * loop draws on rAF, so the second frame after a store commit is the first
 * one guaranteed to have drawn it; nothing else signals a presented frame.
 */
export function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
