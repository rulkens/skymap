# Calibrate body-texture colour to real-world appearance (Mars first)

`needs-design`

## The problem

Mars reads over-saturated (observed 2026-07-24) — noticeably redder than the
planet actually appears. Mars is the trigger, but the question is general: the
textures are sourced for looks, not for colorimetry, and nothing in the
pipeline states what "correct" is.

Real Mars is closer to butterscotch / tan-orange than to the saturated rust
most popular maps show. Surface-truth references (Mastcam, Pancam) are
white-balanced to the scene and differ again from orbital and telescopic
appearance, so "the real colour of Mars" is itself a choice that has to be
stated before it can be hit.

## Why it is the way it is

Most planets, Mars included, carry `provenance: 'sss'` in
`src/data/bodies/bodyTextureRegistry.ts` — Solar System Scope maps, which are
deliberately enhanced for visual appeal rather than calibrated.

The registry already has a per-body colour lever for a different purpose:
the `monoTint` colour treatment, which re-colours the single-channel USGS
sources. So there is precedent for authored per-body colour, but no concept of a
*calibration* distinct from a tint, and no recorded target for any body.

## What a design has to settle

- **The reference.** Which appearance is being matched — naked-eye through a
  telescope, orbital true-colour, or surface white-balanced? These disagree,
  and picking one is the whole decision. Without it, "calibrated" means
  nothing and the change is just a different aesthetic.
- **Where the correction lives.** Build-time (bake it into the emitted tiers,
  one cost, invisible at runtime) versus runtime (a registry column applied in
  the shader, tweakable, but another per-body uniform). The atlas tiles would
  need the same treatment either way, or a body's placeholder and its hi-res
  map would disagree in hue during load.
- **Scope.** Mars alone, or a pass over every `sss` body? A one-off Mars fudge
  is the kind of second special case the project's own conventions say to
  consolidate rather than repeat.

## Related

- The `treatment` tag in `bodyTextureRegistry.ts` — the existing per-body colour
  lever and the obvious place a calibration column would sit beside.
- The boot body-texture atlas (shipped 2026-07-24) — tiles derive from the
  same sources, so any correction must apply to both or the fallback will
  visibly shift hue when the hi-res map lands.
