/** HeightPyramid — a body's height tiles as the horizon march reads them: metres above the
 *  datum at any level, falling back to the deepest available ancestor (Mars has no z8–9, so a
 *  z9 read lands on z7). `subtreeMaxM` is the height header's bound over a tile's whole
 *  subtree, which is what lets the march stop early. */
export type HeightPyramid = {
  readonly radiusM: number;
  heightAt(z: number, lonRad: number, latRad: number): number;
  subtreeMaxM(z: number, x: number, y: number): number;
};
