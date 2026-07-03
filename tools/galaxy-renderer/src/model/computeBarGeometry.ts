/**
 * computeBarGeometry — precomputes a barred galaxy's bar shape (length +
 * fixed orientation trig) once per generation, per `BarGeometry`'s docblock.
 * Ported from galaxy-model.js:228-230.
 *
 * Takes `rand` (a bare draw function) plus the four scalars it needs
 * instead of a whole `GalaxyBuildContext` — it has two callers now: the CPU
 * orchestrator (`generateGalaxy.ts`), which still owns a full context, and
 * `packGenerationUniforms` (Task 2), which packs the GPU generation UBO and
 * never builds one. Threading a `GalaxyBuildContext` through would force the
 * packer to construct star/dust writers and warp/reddening closures purely
 * to satisfy a type it never uses — accidental coupling this reshape
 * removes at the source rather than working around at the call site.
 *
 * Draws the bar-tilt angle from `rand()` *unconditionally* — for every
 * category, not just `'barred'` — because that's where the spike's main
 * stream draws it (model.js:229, between the bulge loop and the
 * `category === 'barred'` branch that actually uses `barLength`). The CPU
 * orchestrator must therefore call this between `buildBulge` and `buildBar`
 * even for non-barred galaxies, or every population drawn after it desyncs
 * from the spike's RNG sequence; the packer's own `mainStream` draws it in
 * the equivalent position for the same reason (see
 * `packGenerationUniforms.ts`'s module header).
 */
import type { BarGeometry } from '../../@types/model/BarGeometry';
import type { GalaxyCategory } from '../../@types/model/GalaxyCategory';

export function computeBarGeometry(
  rand: () => number,
  category: GalaxyCategory,
  outerRadius: number,
  asymmetry: number,
  barStrength: number | undefined,
): BarGeometry {
  const barLength = category === 'barred' ? outerRadius * 0.42 * (barStrength ?? 1) : 0;
  const barAngle = (rand() - 0.5) * 0.6 * asymmetry; // small random tilt
  return { barLength, cosBar: Math.cos(barAngle), sinBar: Math.sin(barAngle) };
}
