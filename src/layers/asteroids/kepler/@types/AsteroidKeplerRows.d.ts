/** AsteroidKeplerRows — one uploaded catalog's GPU buffers, created and destroyed together. */
export type AsteroidKeplerRows = {
  readonly count: number;
  /** The element epoch, JD (TT); the compute's dt is measured from it. */
  readonly epochJd: number;
  /** vec4f per row: A = a·P̂ (AU), e. */
  readonly elementsA: GPUBuffer;
  /** vec4f per row: B = a·√(1−e²)·Q̂ (AU), n (rad/day). */
  readonly elementsB: GPUBuffer;
  /** vec2u per row: M₀ bitcast, then hCenti << 16 | g << 8 | flags. */
  readonly extra: GPUBuffer;
  /** vec4f per dot the last solve kept: heliocentric xyz (AU, equatorial J2000) and lifted flux. */
  readonly visible: GPUBuffer;
  /** u32 per kept dot: row and class (`asteroids/lib/visibleTag.wesl`). */
  readonly visibleTags: GPUBuffer;
  /** Indirect draw args, the instance count being the kept dots; the dot and pick draws read it. */
  readonly draws: GPUBuffer;
  readonly computeGroup: GPUBindGroup;
};
