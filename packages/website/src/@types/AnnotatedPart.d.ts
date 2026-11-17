/**
 * One part of the interface an AnnotatedShot points at
 * (components/docs/AnnotatedShot): its name, what it does, and its box on the
 * shot as `[left, top, width, height]` in the shot row's own CSS pixels (its
 * `size`), as the browser's inspector reads them off the shot's page.
 */
export type AnnotatedPart = {
  name: string;
  does: string;
  box: readonly [number, number, number, number];
};
