/**
 * Channel — the four scalar (or vec3) properties of a CameraPose that an
 * animation clip can drive.
 *
 * ### Why four, and why these four?
 *
 * `CameraPose` has exactly four fields: `distance` (how far the camera orbits
 * from its target), `yaw` and `pitch` (the orbit angles), and `target` (the
 * 3-D world-space point being orbited around). Every camera motion a clip
 * needs to express — zoom, pan, orbit — maps cleanly onto one of these four.
 *
 * Finer-grained channels (e.g. `target.x` as its own channel) were considered
 * but rejected: `target` moves as a unit (you never want X-only panning while
 * Y freezes), and having a single `target` channel with a Vec3 payload keeps
 * the evaluator's per-channel loop symmetric. The `setVec` CameraAction arm
 * handles the Vec3 case; `lerpInSpace` operates per-component at the call site.
 */

export type Channel = 'distance' | 'yaw' | 'pitch' | 'target';
