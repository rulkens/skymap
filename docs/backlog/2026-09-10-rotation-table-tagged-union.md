# Rotation table has one shape; a second orientation kind will need a tagged union

Surfaced while designing mesh bodies (whale/petunias): see
[the design spec](../superpowers/specs/2026-09-10-mesh-bodies-design.md).

## What's there today

`RotationElements` (`src/@types/scene/RotationElements.d.ts`) is a flat
record: an IAU north pole (`poleRaDeg`/`poleDecDeg`) plus a spinning prime
meridian (`primeMeridianDeg`/`spinRateDegPerDay`). Every current consumer,
`orientationForBody` (`src/data/bodies/orientationForBody.ts`) and
`rotationFromIau`, assumes that shape unconditionally. It fits every body on
main today: a textured planet/moon spins about a fixed pole, and everything
else (an anchor, a mesh body's tumble) either carries no row (identity
fallback) or reuses the same pole+meridian shape for a made-up tumble axis,
which is honest enough for a body with no real published pole.

## Why it's not done now

No second orientation kind exists yet. Widening the type to a tagged union
before there's a second real case to model would be speculative generality,
exactly what the project's simplicity convention asks to be judged against
work that actually needs it.

## The trigger

The day a body needs an orientation that isn't "spin about a fixed pole at a
constant rate": a look-at orientation (aim at something moving, e.g. an
antenna dish tracking Earth), or a surface-locked frame (a person standing on
Earth's rotating surface, whose "up" is the local surface normal, not an
independent pole). The surface-fixed position driver
(`2026-09-10-surface-fixed-position-driver.md`) is the most likely body to
trigger this first.

## Shape of the fix

`RotationElements` becomes a discriminated union on an orientation `kind`;
`orientationForBody` dispatches on it instead of assuming the pole+meridian
fields exist. The existing rows become the `kind: 'iau-pole'` arm untouched.

## Files involved

- `src/@types/scene/RotationElements.d.ts`
- `src/data/bodies/rotationElements.ts`
- `src/data/bodies/orientationForBody.ts`
- `src/utils/orbit/rotationFromIau.ts`
