/**
 * cloudShellParams — the named tunable constants for the translucent cloud shell
 * drawn just above Earth's opaque surface (spec §11).
 *
 * One home for the two shell dials, shared by three consumers so they can never
 * drift onto separate literals:
 *
 *   1. **The shell scale** (`cloudShellLayer`): `radiusRatio` scales the unit
 *      sphere the shell rides, lifting it from the surface (unit radius 1.0) to
 *      just above the cloud tops, so the deck floats over the globe instead of
 *      z-fighting the surface it co-registers with.
 *   2. **The shell opacity uniform** (`cloudShellLayer` → `packCloudShellUniforms`):
 *      `opacity` is the coverage-to-alpha multiplier folded into the shell's
 *      straight-alpha output — a global dimmer over the map's per-texel `.a`.
 *   3. **The surface shadow radius** (`earthLayer` → `packEarthSurfaceUniforms`):
 *      the surface pass casts the cloud deck's shadow using the SAME shell radius,
 *      so the shadow geometry and the drawn shell agree by construction (wired in
 *      Task 7 — earthLayer currently passes a literal placeholder there).
 *   4. **The descent fade band** (`cloudDeckFade`, consumed by both
 *      `cloudShellLayer` and `earthLayer`): `fadeStartAltitudeRadii` and
 *      `fadeEndAltitudeRadii` bound the altitude-above-surface range over which
 *      the deck (and the shadow it casts) dissolves as the camera descends
 *      toward streamed surface tiles — see that util's header for why altitude,
 *      not the tile planner's `zWin`, drives the fade.
 *
 * ## radiusRatio — why ≈1.002
 *
 * The shell radius is expressed in the body's unit-sphere local units, where the
 * surface sits at radius 1.0. Cloud tops top out around ~12.7 km (deep-convective
 * anvils); Earth's mean radius is ~6371 km. So the shell sits at
 * `1 + cloudTopKm / earthRadiusKm ≈ 1 + 12.7 / 6371 ≈ 1.002` — a hair above the
 * surface, enough to clear the depth test against the opaque globe without the
 * gap reading as a visible float at close range. The literal is baked here (not
 * recomputed from km) because it is a look dial, not a measured quantity: the
 * visual pass nudges it if the deck z-fights or floats.
 *
 * ## opacity — neutral start
 *
 * `1.0` passes the map's authored coverage `.a` through untouched — the neutral
 * starting point before the visual pass tunes the deck's overall density against
 * the Blue Marble cloud map. The 1×1 transparent placeholder reports `.a = 0`, so
 * at `opacity = 1.0` the placeholder shell still draws nothing until the real map
 * lands.
 *
 * ## fadeStartAltitudeRadii / fadeEndAltitudeRadii — the descent fade band
 *
 * The whole-globe cloud map is coarse next to the surface tiles the camera
 * descends toward, so the deck fades out on approach rather than smearing over
 * detail sharp enough to inspect. The band is calibrated against
 * `planEarthTiles`'s own thresholds, not chosen independently.
 *
 * `planEarthTiles` refines a patch at level `z` while its projected size
 * `screenPx` needs a finer level, and settles at the first level where
 * `screenPx <= 2 · tilePx` (that threshold falls out of
 * `EARTH_TILE_LOD_BIAS = 1`: the planner refines while
 * `ceil(log2(screenPx / tilePx)) - lodBias > 0`). A level-`z` tile spans
 * `2πR / 2^z` of ground (`earthTileColumns` puts `2^z` tiles around the
 * equator), and at altitude `h` a viewport `H` px tall spans `2h·tan(fovY/2)`
 * of world, so `screenPx = (2πR / 2^z) · H / (2h·tan(fovY/2))`. Solving for the
 * altitude at which a level settles:
 *
 *     h(z) = π · R · H / (2^z · 2·tilePx · tan(fovY/2))
 *
 * Plugging in Earth's radius (6371 km), the app's real default vertical
 * FOV — `DEFAULT_FOV_Y_RAD` = 60°
 * (`src/services/engine/camera/cameraFraming.ts`; NOT the 40° an earlier
 * draft of this comment assumed — that gave a band 1.77× too high, fading the
 * deck out around z5 instead of across z6→z7) — `tilePx = 512`
 * (`EARTH_TILE_PX`), and a representative 900 px-tall viewport: z6 settles
 * around 476 km and z7 around 238 km. Expressed in Earth radii that is
 * `476 / 6371 ≈ 0.075` and `238 / 6371 ≈ 0.037` — the fade starts at the z6
 * altitude (still coarse tiles, so the whole-globe deck is doing its normal
 * job) and completes by the z7 altitude (fine tiles now worth looking at, so
 * the deck must be gone). Both fields are altitude ABOVE the surface —
 * `cameraDistance / bodyRadius - 1` — not the shell's own `radiusRatio`
 * offset, which places the shell geometry rather than gating its visibility.
 * See `cloudDeckFade` for the curve these feed.
 *
 * This is a CALIBRATION against a default viewport, not an identity: `h`
 * scales linearly with viewport height `H`, so a taller window shifts every
 * level's settling altitude upward (at `H = 1000` the z6 altitude is ~529 km,
 * not ~476 km), and the tier's base level plus `EARTH_TILE_LOD_BIAS` also
 * move where the planner actually settles for a given session. The band
 * therefore tracks the tile levels approximately and by intent, not exactly —
 * which is fine, because it is a look dial, and it is the same reason the
 * fade keys off altitude rather than reading the planner's `zWin` directly
 * (see `cloudDeckFade`'s header for that rationale — not repeated here).
 */

export const CLOUD_SHELL_PARAMS: {
  readonly radiusRatio: number; // shell radius in unit-sphere local units (≈ 1 + cloudTopKm/earthRadiusKm)
  readonly opacity: number; // coverage-to-alpha multiplier into the shell's straight-alpha output
  readonly fadeStartAltitudeRadii: number; // altitude (body radii) where the descent fade begins (≈ z6, 476 km)
  readonly fadeEndAltitudeRadii: number; // altitude (body radii) where the descent fade completes (≈ z7, 238 km)
} = {
  radiusRatio: 1.002,
  opacity: 1.0,
  fadeStartAltitudeRadii: 0.075,
  fadeEndAltitudeRadii: 0.037,
};
