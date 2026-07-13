/**
 * One ionizing star: a light source for the nebula bake + raymarcher AND a
 * billboard in the scene. `power` is the visible luminous output (HDR,
 * unbounded — drives in-scatter and the billboard brightness); `uv` is the
 * ionizing-flux strength (drives the emission term separately, so a hot
 * O-star can ionize harder than it visually glows).
 */
export type LightStar = {
  readonly position: readonly [number, number, number];
  readonly power: number;
  readonly color: readonly [number, number, number];
  readonly uv: number;
};
