# Milky Way v2 field: v1 cost at v2 fidelity

The v2 analytic field landed behind `renderer: 'v2'` (default stays `'v1'`) because it costs too much
to turn on. Owner's goal: about v1's GPU cost with v2's look. Own PR off main, measure first.

## Measured (2026-11-10, Apple Silicon, dpr 2, 1400×900)

- **App, wall clock, GPU saturated:** at the `milky-way` pose the frame goes 5.8 → 10.0 ms with v2,
  over the 120 Hz budget. At `milky-way-close` v1 and v2 are about equal (8.3 / 8.5 ms). The field
  costs about 5.2 ms whether other layers are on or off, so there is no stall and no interaction
  between layers.
- **Harness, per pass:** v2 is 6–8 ms of real GPU time at the three Milky Way poses, against about
  2 ms for v1. Most of it is `mw-field-compute`; the `milky-way-field` composite is 0.6–1 ms.
- **Galaxy tool, cost per target** at the outside and close poses (in-disc in brackets):

  | target | ms |
  |---|---|
  | field splat (divisor 6) | 2.6 (6.5) |
  | young HII tier (divisor 2) | 1.9–2.3 (7.0) |
  | per-component dust attenuation, the 4-slice branch in `dustAttenuation.wesl` | 1.7–1.9 (4.1) |
  | shells | 1.3 |
  | dustMap pass | 0.5 (3.5) |
  | dig | 0.15 |
  | composites | 0.33 |

- **Divisor sweeps:**
  - young is fully fill-bound (D2 → D4 saves 1.3–1.5 ms);
  - field and dustMap are only about half fill-bound (exponent 0.5–0.65);
  - shells don't change with their divisor, so they have no bandwidth cost.

## Levers, in the owner's order (re-asked after the per-target data; confirm at pickup)

1. Dust transmittance once per pixel, plus a single-slice fast path. It replaces 4 `expHalfErfc`
   and 4 `exp` per component-fragment.
2. A cheaper young tier: a coarser divisor (needs an eye check), or cheaper star-grain fetches.
3. Tight ellipsoid quads instead of `splatSilhouette.wesl`'s bounding sphere of 4.5·max σ.
   Count the q-cut waste first, because the field is only half fill-bound.

Refuted: drawing the shells straight into HDR (they have no bandwidth cost) and caching at rest
(the loop already sleeps).

Scripts and raw runs lived in the session scratchpad (`mw-perf/`, `mw-perf-targets/`, `mw-stall/`).
Re-create them from these recipes:
- the harness A/B on two servers;
- the galaxy-renderer `engine.step()` ×40 driver;
- the saturated-GPU `onSubmittedWorkDone` probe.
