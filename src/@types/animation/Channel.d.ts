/**
 * Channel — the scalar (or vec3) properties of a CameraPose that an animation
 * clip can drive: one per `CameraPose` field. `distance` (how far the camera
 * orbits from its target), `yaw` and `pitch` (the orbit angles), `roll` (about
 * the view axis) and `target` (the 3-D world-space point being orbited around).
 *
 * Finer-grained channels (e.g. `target.x` as its own channel) were considered
 * but rejected: `target` moves as a unit (you never want X-only panning while
 * Y freezes), and having a single `target` channel with a Vec3 payload keeps
 * the evaluator's per-channel loop symmetric. The `setVec` CameraAction arm
 * handles the Vec3 case; `lerpInSpace` operates per-component at the call site.
 */

export type Channel = 'distance' | 'yaw' | 'pitch' | 'roll' | 'target';
