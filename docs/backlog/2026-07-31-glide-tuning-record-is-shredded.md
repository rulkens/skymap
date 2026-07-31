# `GlideTuning` is created as one record, then shredded into per-knob params

Found by `entanglement-radar` over PR #531 (perceptually uniform focus moves). This is the
root braid of that feature; three smaller findings hang off it.

## The problem

`src/@types/camera/GlideTuning.d.ts`'s own docblock says the five knobs are "carried as one
record because they are calibrated together and meaningless apart". Every hop then splits them:

| hop                                              | what travels                              | what is dropped                           |
| ------------------------------------------------ | ----------------------------------------- | ----------------------------------------- |
| `focusTweenDescriptor` → `CameraTweenDescriptor` | `easing`, `rho`, precomputed `durationMs` | `velocity`, `minSec`, `maxSec`            |
| `tweenToClip` → `glide()`                        | `over`, `rho`, `ease`                     | —                                         |
| `Effect{kind:'glide'}` → `buildGlideTrack`       | `over?`, `rho?`, `ease`                   | —                                         |
| `buildGlideTrack` → `glidePath`                  | `{ rho }` only                            | `velocity`, `minSec`, `maxSec`, the store |

`ρ` has nine homes. `ease` has a parallel chain that already diverged once (two different
defaults at the two ends — fixed, but the shape that allowed it is still here).

`EngineSettingsState.d.ts`'s justification — "`rho` reaches BOTH … `velocity`/`minSec`/`maxSec`
only convert arc length to seconds, so they stop at the producers" — is asymmetry-documentation:
it teaches which two of five knobs must be hand-forwarded instead of removing the requirement.
That is the STOP-and-un-braid signal from `simplicity.md`.

## The cost, latent

`buildGlideTrack` calls `glidePath(start, to, fovYRad, { rho })`, so a **clip-authored** `glide`
with no `over` derives its duration from module defaults and never sees `settings.debug.glide`.
The DebugPanel's V / min / max sliders visibly work for a focus move and silently do nothing for
a clip glide.

**This exact shape has already been fixed twice** during the feature: once for `rho` on the
follow driver (`ab60d578`), once for `ease` (`e52f6f50`). Third instance is pre-built. No
authored clip uses `glide()` yet, so it is a trap rather than a live defect.

## Shape

Carry the record, not its fields: `Effect{kind:'glide'}.tuning?: Partial<GlideTuning>`,
`CameraTweenDescriptor.tuning?: GlideTuning`, `BuildParams.tuning?`. `glidePath` stays the one
place defaults are applied — it already is. A new knob then costs one `GlideTuning` field plus
one `GLIDE_SLIDER_FIELDS` row.

Side effect: it makes "duration and path shape come from two separate `glidePath` calls" moot,
because the compiled path is provably the one that was timed — same record.

`GLIDE_SLIDER_FIELDS`' key type (`Exclude<keyof GlideTuning, 'ease'>`) is the shape to copy: the
UI registry cannot drift from the record.
