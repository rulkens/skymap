# `CompositeTrack.channels` is a second spelling of `sample`'s key set

Found by `entanglement-radar` over PR #531. Two sources of truth for the same fact, and the two
directions of disagreement fail differently — both silently.

## The problem

A `CompositeTrack` declares `channels: readonly Channel[]` AND returns a `Partial<CameraPose>`
from `sample`. Nothing binds them.

- **Over-returning** (sample returns a key not declared): guarded in `evaluateClip`'s
  `compositePoseAt`, which copies only declared channels. That guard **cannot fire** — both
  current builders return exactly what they declare, verified by replacing the guard with a
  blind `Object.assign` and watching all 1417 engine tests still pass.
- **Over-declaring** (channels lists a key sample never returns): **unguarded, and worse.**
  `validateCompositeExclusivity` fences base writers off that channel at compile time, then
  `evaluateClip` does `composite.yaw ?? evaluateBaseScalar(baseTracks['yaw'], …)` — reading a
  now-empty base track and returning `start.yaw`. **The channel silently freezes at the clip's
  opening value**, with the writer that would have driven it rejected at compile time.

So the guard that exists protects the benign direction, and the dangerous one has nothing.

## Shape

Do not argue about keeping the guard — it is a symptom. Bind the two spellings:

- **Probe once at compile time**: `Object.keys(sample(0))` in `compileClip`, one home, throw on
  mismatch. Cheap, catches both directions, needs `sample` to be safe at `s = 0` (it is).
- **Or make it type-level**: `CompositeTrack<C extends Channel>` with
  `sample: (s: number) => Pick<CameraPose, C>`. Stronger, more invasive.

Either way the guard and the freeze both stop being possible.

## Why it was not fixed in #531

The freeze is unreachable today: `buildPathTrack` declares `ALL_CHANNELS` and returns all four;
`buildGlideTrack` declares `['target','distance']` and returns exactly those. It becomes
reachable the moment a third composite writer is added — which is the point at which someone
will be reading this file.
