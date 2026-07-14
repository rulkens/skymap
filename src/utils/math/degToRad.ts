/**
 * degToRad — degrees → radians, the one shared angular conversion.
 *
 * Trig authoring in this codebase reads in degrees (JPL element tables, IAU
 * pole directions, the ecliptic obliquity) but every runtime consumer wants
 * radians. A per-module `const DEG_TO_RAD = Math.PI / 180` copy was the norm
 * until a second identical copy appeared — the moment a constant is written
 * twice it earns a single home, so the conversion lives here and each site
 * calls `degToRad(x)` instead of open-coding `x * DEG_TO_RAD`.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
