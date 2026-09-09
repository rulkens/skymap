# No position driver for a body fixed to a host's rotating surface

Surfaced while designing mesh bodies (whale/petunias): see
[the design spec](../superpowers/specs/2026-09-10-mesh-bodies-design.md), which
names a person standing on Earth's surface as a future body on the same
presentation arm.

## What's there today

`deriveBodyStates` (`src/services/engine/frame/deriveBodyStates.ts`) resolves
every `SceneBody`'s position one of two ways: `SCENE_ANCHORS` gives a fixed
heliocentric point (no orbit, `meanAnomalyRad: 0`), and `ORBITAL_ELEMENTS`
gives a Keplerian orbit around a `focusId`. There is no third option for "a
fixed point on a rotating host's surface": a latitude/longitude locked to
the host's own spin, so the point sweeps around with the planet rather than
sitting still in the heliocentric frame (an anchor) or orbiting independently
of the host's rotation (an element row with the host's own radius as
`semiMajorMpc`, which would place the body correctly only at one instant and
then drift relative to the ground beneath it, since its own Keplerian
mean-motion has no reason to match the host's spin rate).

## Why it's not done now

The mesh-bodies feature's two bodies (whale, petunias) both orbit; an
existing driver covers them exactly. Building a driver with no consumer to
verify it against is speculative.

## The trigger

A body meant to stay fixed on a host's surface: the person named in the
mesh-bodies spec's non-goals, or an equivalent future body (a monument, a
landmark).

## Shape of the fix

A third position-driver kind: latitude/longitude plus the host id, resolved
each frame as `hostState.positionMpc + hostState.orientation · (host's
surface point in body-fixed axes)`, the same rotation `orientationForBody`
already produces for the host, applied to a fixed local-frame offset instead
of to lit geometry. Likely lands as a new arm of a driver union `deriveBodyStates`
dispatches on (orbit / anchor / surface-fixed) rather than a third parallel
table, so a body's position kind stays one property to read, not three
tables to check membership in.

## Files involved

- `src/services/engine/frame/deriveBodyStates.ts`
- `src/data/bodies/sceneAnchors.ts`
- `src/data/bodies/orbitalElements.ts`
- `src/@types/scene/BodyState.d.ts`
