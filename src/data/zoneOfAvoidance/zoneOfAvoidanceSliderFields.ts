/**
 * ZONE_OF_AVOIDANCE_SLIDER_FIELDS — the one enumeration of the guide band's
 * scalar tuning knobs, with the UI metadata each needs. Same shape as
 * `data/milkyWay/milkyWaySliderFields.ts`: label, range, granularity and
 * formatting live in ONE row per knob, and the DebugPanel section iterates
 * this list rather than re-spelling sliders by hand. `color` (a `Vec3`) isn't
 * here — the section wires it as three bespoke rows. A parity test
 * (`tests/data/zoneOfAvoidance/zoneOfAvoidanceSliderFields.test.ts`) fails if
 * a scalar `ZoneOfAvoidanceTuning` leaf is added without a matching row.
 */
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { ZoneOfAvoidanceSliderKey } from '../../@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderKey';
import type { ZoneOfAvoidanceSliderField } from '../../@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderField';

export const ZONE_OF_AVOIDANCE_SLIDER_FIELDS: readonly ZoneOfAvoidanceSliderField[] = [
  {
    key: 'intensity',
    label: 'intensity',
    min: 0,
    // Additive; the 4x ceiling over the 0.5 default reaches "band reads as
    // opaque" without the slider needing a second pass to get there.
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Additive brightness of the band at full presence (galactic plane, b=0).',
  },
  {
    key: 'radialFalloff',
    label: 'radialFalloff',
    // Normalised fraction of the shell's radial span — the full unit
    // interval is the natural range, not a feel-derived ceiling.
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: "E-folding length, as a fraction of the shell's radial span, of the density decay from the inner rim outward.",
  },
  {
    key: 'edgeSharpness',
    label: 'edgeSharpness',
    min: 0,
    // Degrees of galactic latitude; the band's b-limit is itself only a few
    // tens of degrees, so a feather past ~5deg would already blur past the
    // limit rather than soften an edge.
    max: 5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: "Feather width, in degrees of galactic latitude, of the band's b-limit fade.",
  },
];

/**
 * Build a `ZoneOfAvoidanceTuning` patch for one slider field. The cast is
 * sound: every `ZoneOfAvoidanceSliderKey` addresses a number-valued leaf, but
 * a computed-key object literal widens to `{ [k: string]: number }`, which
 * the compiler won't narrow on its own — the same trick `milkyWaySliderPatch`
 * uses.
 */
export function zoneOfAvoidanceSliderPatch(
  key: ZoneOfAvoidanceSliderKey,
  value: number,
): Partial<ZoneOfAvoidanceTuning> {
  return { [key]: value } as Partial<ZoneOfAvoidanceTuning>;
}
