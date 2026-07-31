# `fovYRad` is threaded through the compile path for a value that never varies

Found by `entanglement-radar` over PR #531. Mostly harmless plumbing with one live hazard in it.

## The state

`compileClip(data, frameBasis?, fovYRad?)`, `evaluateClip(data, elapsedSec, frameBasis?,
fovYRad?)`, `Accum.fovYRad?`, `BuildParams.fovYRad`, plus `?? DEFAULT_FOV_Y_RAD` in
`compileClip` — all for a value that is `DEFAULT_FOV_Y_RAD` at every call site today.
`wireInput.ts` assigns it once and copies it into `cameraRuntime.projection`; nothing ever
writes it again (a resize mutates `projection.aspect`, not `fovY`). Three test files grew
`cameraRuntime.projection` stubs to carry it.

## The part that is not free

`evaluateClip`'s compile cache keys on `fovYRad`, with a comment conceding "a continuously
varying FOV would thrash this cache". Since the value never varies, that key can only ever
miss — it can never help.

And if FOV ever does become live (a zoom-lens setting, a cinematic FOV pull), the recompile is
not a perf problem, it is a **correctness** one: recompiling mid-glide rebuilds the geodesic
under a live flight, so the camera jumps. **The cache key makes that failure silent rather than
loud.**

## Shape

Pick one, do not keep both:

- **Drop the parameter** and import `DEFAULT_FOV_Y_RAD` inside `glidePath`. Honest about FOV
  being a constant; deletes the plumbing and the test stubs.
- **Keep the parameter, drop it from the cache key**, with a comment stating that a mid-clip FOV
  change is unsupported. Keeps the seam open for a future live FOV, and makes the unsupported
  case explicit rather than silently degrading.

The second is probably right if a cinematic FOV pull is ever wanted; the first if not.
