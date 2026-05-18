# Cluster / Supercluster / Void Visualization — Halo + Ring + Focus Mode

**Status:** Draft, awaiting user review
**Date:** 2026-05-18
**Author:** Alexander Rulkens (with Claude)

## 1. Goal and motivation

The current cluster/supercluster/void POIs render as three perpendicular
axis-aligned line segments — the `makeCrosshairLines` helper inside
`poiSubsystem`. The crosshair was a quick "X marks the spot" affordance
that proved its worth as a debugging audit overlay (cross-referencing
CF-4 density peaks against textbook anchors) but it has aged into the
runtime visual language and now reads as *debug furniture* rather than
as a feature that conveys awe at the scale of these structures.

Two specific failure modes:

1. **A three-line crosshair has no extent.** Virgo's ~2 Mpc cluster
   radius, Hercules SC's ~50 Mpc extent, and the Boötes Void's ~50 Mpc
   emptiness are all reduced to a small "+"-shaped gizmo of identical
   pixel size. Users can't see *how big the structure is*.
2. **Selection is impossible to discover.** The crosshair has no
   meaningful hit target (three 1-pixel lines), so there's no way to
   click a cluster and ask "what galaxies are in this?" The InfoCard
   path that already exists for galaxies has no POI equivalent.

This spec replaces the crosshair with a **soft additive halo + a
screen-aligned faint ring at the cluster's physical radius**, both
world-scaled in Mpc so flying toward Virgo makes them grow naturally.
Voids get the ring alone (no halo glow), tinted cyan to read as
*absence* rather than *presence*. Famous-galaxy POIs are left alone —
they already have curated thumbnails on close approach (see
`2026-05-17-famous-galaxy-labels-design.md`) and don't fit the
"extended structure" model.

In tandem, this spec introduces **focus mode**: single-clicking a POI's
ring (or label) opens the InfoCard and dims the non-member galaxies to
~8% alpha so the cluster's actual membership pops out of the field.
Double-click additionally tweens the camera to frame the structure.
The pattern mirrors the existing galaxy `focusOn` / `selectFamous` /
`selectByAlias` chain in `commitFocus` — same gestures, same
`onSelectChange` echo into the URL hash, parallel `commitPoiFocus`
helper.

## 2. At-rest visualization

### 2.1 Per-category primitives

| Category | Halo | Ring | Halo tint | Ring tint |
|---|---|---|---|---|
| `cluster` | yes — soft, ~radius extent | yes — at `physicalRadiusMpc` | warm yellow `[1.0, 0.85, 0.4]` | same |
| `supercluster` | yes — more diffuse, broader falloff | yes — at `physicalRadiusMpc` | warm orange `[1.0, 0.8, 0.5]` | same |
| `void` | **no** (would imply matter) | yes — at `physicalRadiusMpc` | n/a | cyan `[0.45, 0.7, 0.85]` |
| `famousGalaxy` | **unchanged** — keep existing label + thumbnail treatment | | | |

The per-category styling lives alongside the existing `POI_STYLES`
table in `poiSubsystem.ts`. The current style fields (`labelColor`,
`lineColor`, `minPixelSize`, `maxPixelSize`, `worldEmMpc`, `pixelWidth`,
`fadeBandPx`) are unchanged; new optional fields describe the halo +
ring:

```ts
type CategoryStyle = {
  // ... existing fields unchanged ...
  /**
   * Marker style for this category's at-rest visualization.  Absent →
   * fall back to the legacy crosshair (preserved for famousGalaxy and
   * any future category that opts out).
   */
  readonly marker?: ClusterMarkerStyle;
};

type ClusterMarkerStyle = {
  readonly kind: 'haloAndRing' | 'ringOnly';
  /** Halo billboard tint (RGB, alpha is computed per-frame). Absent for ringOnly. */
  readonly haloColor?: Vec3;
  /** Ring colour (RGBA — alpha is the at-rest base, fade modulates further). */
  readonly ringColor: Vec4;
  /** Ring pixel thickness. Stays constant in screen space at any zoom. */
  readonly ringPixelWidth: number;
  /** Number of line segments approximating the ring circle. 32 default. */
  readonly ringSegments: number;
  /**
   * Apparent-radius (in pixels) above which the marker fades out so the
   * user can fly INTO the cluster without an obnoxious giant circle
   * filling the view.  Reuses the existing fadeBandPx smoothstep
   * pattern for symmetry with the label fade-in.
   */
  readonly maxApparentRadiusPx: number;
  readonly maxApparentFadeBandPx: number;
};
```

### 2.2 World-space scaling

The halo billboard and ring are sized in **world-space Mpc** from
`PointOfInterest.physicalRadiusMpc` (see §7 for the rename from
`crosshairSizeMpc`). The vertex shader projects them to screen space
each frame, so:

- Far from Virgo (1000 Mpc away): the 2 Mpc-radius ring projects to
  a few pixels. Visible but unobtrusive.
- Close to Virgo (10 Mpc away): the same ring projects to a large
  on-screen circle — the user reads *extent*, not just *centre*.

This is the same principle the existing label `worldEmMpc` uses, and
it intentionally inverts the crosshair's behaviour (the crosshair was
also world-scaled but its "extent" semantically only said *how
big is the gizmo*, not *how big is the cluster*).

### 2.3 Fade-out at close approach

When the cluster's apparent on-screen radius exceeds
`maxApparentRadiusPx`, the halo + ring fade to zero alpha across the
`maxApparentFadeBandPx` smoothstep band. Rationale: once the user has
flown so close that the cluster fills most of the viewport, the ring
becomes a giant circle obscuring the galaxies it is supposed to
contain. The fade hands the view back to the galaxies once the
membership context has been delivered.

The smoothstep is implemented identically to the existing
`fadeBandPx` ramp inside `poiSubsystem.produceLabels`:

```ts
// Per-frame, per-POI, hoisted out of any inner loop.
const apparentRadiusPx = (physicalRadiusMpc / distanceMpc) * pxPerRad;
let markerAlpha = 1;
if (apparentRadiusPx > style.maxApparentRadiusPx) {
  const t = Math.min(
    1,
    (apparentRadiusPx - style.maxApparentRadiusPx) / style.maxApparentFadeBandPx,
  );
  markerAlpha = 1 - t * t * (3 - 2 * t);  // smoothstep falloff
  if (markerAlpha > 0 && markerAlpha < 1) awake = true;
}
```

The `awake = true` write keeps the engine's render-on-demand loop
spinning while the fade transitions, matching the existing pattern.

### 2.4 Labels are unchanged

The anchor-offset label + optional vertical marker-line behaviour
(`labelAnchorOffsetMpc`) stays exactly as it is today. Only the
crosshair `MarkerLine[]` output from `makeCrosshairLines` is replaced;
labels and anchor lines continue through the existing label/line
pipeline.

## 3. Focus mode

### 3.1 Trigger gestures

Matching the existing convention for galaxy selection (already
confirmed with the user):

| Gesture | Behaviour |
|---|---|
| **Single click** on POI ring or label | Open `InfoCard` for the POI + activate focus mode. Camera stays put. |
| **Double click** on POI ring or label | Same as single click PLUS tween the camera to the POI at a framing distance derived from `physicalRadiusMpc` (see §5). |
| **Click empty space** (anywhere not on a POI or galaxy) | Exit focus mode + close `InfoCard`. |
| **Click the InfoCard close button** | Same as click empty space. |

This mirrors the galaxy click/dblclick semantics already wired through
`commitFocus` (single click ⇒ select only; double click ⇒ select +
tween). The same physical gestures means no new mental model for the
user; only the *target type* differs.

### 3.2 Member vs non-member alpha

Focus mode is uniform-driven (no per-vertex changes in the catalog
buffers). When active:

- **Member galaxies**: full brightness (alpha multiplier = 1.0).
- **Non-member galaxies**: fade to ~8% alpha. Don't go to zero —
  preserving the surrounding spatial context is the whole point;
  blackout would feel like a different scene rather than "this is the
  cluster *within* the field you were already looking at".
- **Selected POI's marker (halo + ring)**: brighten — multiply ring
  alpha by ~1.5 (clamped to 1.0), warm the colour a touch via uniform.
- **Other POIs' markers**: dim to ~25%, so the selected one stands
  alone.

The 8% / 25% / 1.5× values are starting points; a follow-up may want
them tunable from a settings panel, but for v1 they are constants
inside `clusterFocusSubsystem`.

### 3.3 Void inversion

Voids are the inverse case: the structure of interest is *the
emptiness*. So when a void is the focused POI, the member rule flips:

- Galaxies **inside** the void radius fade to ~8% alpha (showing what
  little there is, but de-emphasised).
- Galaxies **outside** the void radius stay at full brightness
  (preserving the bordering wall structure that defines the void).

This is communicated to the shader by a single `invert: u32` flag in
the focus uniform block. The membership computation is the same
`distance(galaxy, center) < radiusMpc` test; only the alpha mapping
inverts.

### 3.4 Transition

The 400 ms fade between "no focus" and "focused" is driven by the
existing `fadeController`. The relevant fade handles:

- `{ kind: 'focusContrast' }` — a new singleton fade handle that
  ramps 0 → 1 when focus activates, 1 → 0 when it deactivates. The
  shader reads this fade as `focusBlend` and lerps the per-galaxy
  alpha multiplier between `1.0` and the focus-mode target. At
  `focusBlend == 0` the focus uniforms have no visible effect — so
  the bind group can stay bound at all times without per-frame
  conditional rebinding.

`scheduler.requestRender()` is called on activation/deactivation, and
the engine's existing "still-fading" predicate keeps the loop alive
through the transition (the same way label fade-ins work today).

## 4. Membership computation

### 4.1 Pure function

```ts
// src/utils/cluster/clusterMembership.ts

/**
 * Compute the global indices of every galaxy within `radiusMpc` of
 * `center` across all loaded catalogs.
 *
 * Pure — no side effects, no caching internally. The caller (the
 * focus subsystem) memoises the result against `(poiId, dataRev)`.
 */
export function computeClusterMembership(
  clouds: ReadonlyMap<Source, GalaxyCatalog>,
  center: Vec3,
  radiusMpc: number,
): readonly number[];
```

The function walks every loaded catalog, computes the squared distance
from `center` to each galaxy position (avoiding the square root via
`r2 < radius * radius`), and returns a frozen `readonly number[]` of
global indices in catalog-iteration order.

The "global index" encoding matches the rest of the engine: it is the
same packed `(sourceCode << 27) | localIdx` identity used by the
selection halo + pick buffer. The membership array is therefore
directly comparable against `selectedPacked` and against shader-side
identities.

### 4.2 Why no build-time precompute

The user explicitly endorsed runtime computation ("we have the
galaxies, just query them"). Justifications:

- **Bins stay simple.** The v4 binary format is unchanged — no new
  per-row "cluster membership" column to add or version-bump.
- **Live tuning.** The cluster radius can be tweaked at runtime (a
  future settings slider) without rebuilding `~280 MB` of bin files.
- **Cheap enough.** ~3.5M galaxies across all three loaded surveys ×
  one Vec3 subtract + one dot product per check. On the user's hardware
  this is single-digit milliseconds — well within acceptable selection
  latency (the existing focus tween is 600 ms).
- **Defers a cross-match question.** Real cluster membership requires
  redshift-space distortions, Abell-catalog cross-referencing, and
  velocity cuts. The cone-search approximation is *iconic* (see
  §12), and elevating it to a build-time artefact would imply a
  rigour we don't have.

### 4.3 Caching

The subsystem caches `(poiId, dataRev) → readonly number[]`. The
`dataRev` is a monotone counter bumped whenever any source's catalog
buffer is uploaded (tier swap, catalog reload), so the cache invalidates
automatically when the underlying data changes. Without it, switching
to a larger tier and back would silently keep stale member arrays.

For v1, the cache lives inside `clusterFocusSubsystem` and never
evicts (~20 POIs × ~5 MB max array = 100 MB worst case, but realistic
load is <1 MB total). If memory pressure ever becomes a concern, swap
in an LRU.

### 4.4 Uniform delivery

Per-galaxy membership cannot be uploaded as a uniform array (uniform
buffers max out at 64 KiB; 3.5M u32s would be 14 MB). Two options were
considered:

- **(a)** Upload a per-galaxy storage-buffer bitmask, one bit per
  galaxy, into `@group(3)` (or sneak into an unused slot in the
  source uniform).
- **(b)** Re-derive membership on the GPU per frame from
  `(focusCenter, focusRadius, galaxyPosition)`.

This spec picks **(b)**: the shader receives `focusCenter: vec3<f32>`
and `focusRadiusMpc: f32` in a small uniform block and recomputes
`distance < radius` per vertex. It costs one vec3 subtract + one dot +
one compare per galaxy per frame — well under the cost of the
existing per-vertex apparent-size projection. Option (a) carries the
membership semantics inside an opaque bitmask that's harder to
debug; (b) makes the uniform self-describing.

The CPU-side `computeClusterMembership` is still needed (and
authoritative) for non-shader consumers: the `InfoCard`'s "Member
galaxies: 1,247" count, the future "tour mode" iterator, etc. Both
sides must agree on the cone-search predicate; a parity test in
`tests/utils/cluster/clusterMembership.test.ts` asserts the CPU and
shader compute the same set for a fixture catalog and known POI.

## 5. Camera integration

### 5.1 Reuse `tweenToGalaxy`

`tweenToGalaxy` already takes a structural `TweenTarget = { x, y, z,
diameterKpc }`. POIs construct one trivially:

```ts
const target: TweenTarget = {
  x: poi.worldPos[0],
  y: poi.worldPos[1],
  z: poi.worldPos[2],
  diameterKpc: poi.physicalRadiusMpc * 2 * 1000,  // Mpc → kpc, radius → diameter
};
```

The helper is unchanged. Reuse cleanly avoids forking the camera-tween
machinery that already handles cam-null guards, snapshotted from-pose
hand-off, and `scheduler.requestRender()`.

### 5.2 New helper: `commitPoiFocus`

Parallel to the existing `commitFocus` (galaxy version). Three steps:

```ts
// src/services/engine/helpers/commitPoiFocus.ts
export function commitPoiFocus(
  state: EngineState,
  cb: EngineCallbacks,
  poi: PointOfInterest,
  options?: { tween?: boolean },
): void {
  // 1. Tell the focus subsystem about the new selection (member compute,
  //    fade activation, uniform write).
  state.subsystems.clusterFocus.setSelected(poi);

  // 2. Notify React so the URL hash + InfoCard update in lock-step.
  cb.camera?.onPoiFocusChange?.(poi.id);

  // 3. Optionally tween the camera (single click: skip; double click: tween).
  if (options?.tween) {
    tweenToGalaxy(state, poiToTweenTarget(poi));
  }
}
```

The single/double-click difference is one boolean argument — same shape
as the existing galaxy path, where `selectByAlias` and `focusOn`
differ only in whether they call the tween.

### 5.3 Per-category framing multiplier

The galaxy `focusDistanceMpc(diameterKpc)` uses `8 × diameter / 1000`
(see `focusTween.ts`). Applying 8× to a supercluster with a 50 Mpc
radius (100 Mpc diameter) yields a 800 Mpc framing distance — past
the edge of the visible volume. Per-category multipliers are needed:

| Category | Multiplier | Example framing |
|---|---|---|
| `cluster` | 8× | Virgo at 2 Mpc radius → 32 Mpc framing (the whole halo with margin) |
| `supercluster` | 2.5× | Hercules SC at 50 Mpc radius → 250 Mpc framing (fills the screen) |
| `void` | 2.5× | Boötes Void at 50 Mpc radius → 250 Mpc framing |
| `famousGalaxy` | n/a — keeps existing `focusDistanceMpc` | |

#### Design choice: new helper vs. extending `focusDistanceMpc`

Two options were considered:

**Option A — extend `focusDistanceMpc`:**

```ts
export function focusDistanceMpc(
  diameterKpc?: number,
  multiplier?: number,
): number;
```

Backward-compatible (the multiplier defaults to the current 8×) and
small. But it gives a name like `focusDistanceMpc` a second parameter
whose semantics belong to the *caller's* domain (POI category), not
the helper's. The helper would have to silently accept any number and
trust the caller to pass a sensible one.

**Option B — new helper `poiFocusDistanceMpc`:**

```ts
// src/services/engine/camera/poiFocusTween.ts
export function poiFocusDistanceMpc(
  category: PoiCategory,
  physicalRadiusMpc: number,
): number;
```

Encapsulates the per-category multiplier table inside the helper
itself, keeps the galaxy helper a single-purpose function, and gives
the implementer one place to tune the framing constants. The cost is
one new file.

**Recommendation: Option B.** The galaxy path is hot and well-tested;
adding an optional parameter creates a wider call surface and a
subtle "wrong multiplier silently passes" failure mode. A dedicated
POI helper makes the per-category dispatch explicit and keeps
`focusDistanceMpc` exactly as auditable as it is today.

Flagged as an open decision in §11 in case the implementer prefers
Option A.

### 5.4 New callback `onPoiFocusChange`

Adding to `EngineCallbacks.camera`:

```ts
type EngineCameraCallbacks = {
  readonly onFocusChange?: (info: GalaxyInfo) => void;
  // NEW: parallel callback for POI selection.  `null` means focus cleared.
  readonly onPoiFocusChange?: (poiId: string | null) => void;
};
```

Parallel to `onFocusChange`. The React side wires it to update the
URL hash with a `poi=<id>` segment and open the cluster-flavoured
`InfoCard` panel. The two callbacks never both fire on the same
gesture — clicking a POI clears the galaxy selection, and vice
versa — so the React hash code is a clean if/else.

### 5.5 New handle method `focusOnPoi`

```ts
// EngineCameraHandle additions
type EngineCameraHandle = {
  // ... existing ...
  readonly focusOnPoi: (poi: PointOfInterest) => void;
};
```

Wired in `engine.ts` parallel to `focusOn`. The handle method is the
public surface used by React (e.g. when a deep link `#poi=virgo` resolves
on first paint).

## 6. Pickability

### 6.1 Encoding inside the existing pick buffer

The existing pick buffer uses an `r32uint` texture, with each fragment
writing `(sourceCode << 27) | localIdx) + PICK_SENTINEL_OFFSET`. The
encoding splits the 32 bits as:

```
bits 27..31  →  sourceCode  (5 bits, 0..31)
bits  0..26  →  localIdx    (27 bits, 0..134M)
```

Crucially, **source code 31 is intentionally unallocated** — kept free
so the all-ones `0xFFFFFFFF` "no selection" sentinel stays disjoint
from any real identity. The remaining 26 slots (5..30) were sized this
way deliberately to support multiple pickable surveys (and, now, POI
categories).

### 6.2 Allocate one source code per POI category

POIs slot into the existing source-code system rather than hacking a
high-bit flag. The pick encoding's 5-bit source code field was sized
exactly to support multiple pickable kinds, and the per-category
allocation keeps the pick decode self-describing — the source code
*is* the category, no extra lookup needed.

| Code | Source |
|---|---|
| 0 | Synthetic |
| 1 | SDSS |
| 2 | TwoMRS |
| 3 | Glade |
| 4 | Famous |
| 5 | **Cluster** (new) |
| 6 | **Supercluster** (new) |
| 7 | **Void** (new) |
| 8..30 | unallocated (future surveys / POI categories) |
| 31 | reserved — all-ones sentinel (`0xFFFFFFFF`) |

The 27-bit `localIdx` field carries the POI index into the
per-category table (≤ 134M, vastly more than the ~10 POIs per category
we expect).

**Why per-category rather than a single shared "POI" source code:**

- The pick result tells you the category directly. No
  `lookup-by-index` step into a merged POI table.
- `setCategoryVisible` in `poiSubsystem` already toggles visibility
  per-category; the partitioning extends naturally to the pick
  encoding.
- The bitmask infrastructure (`maskHas` / `maskWith` in `sources.ts`)
  works per source code, so future features like "hide all cluster
  pick targets" compose without new machinery.
- Three codes is cheap — 23 of 26 remain free after this allocation.

**Why these codes are added to the `Source` enum:**

The POI codes (5, 6, 7) are appended to `Source` in `sources.ts`
following the existing "append, never recycle" rule. POIs have no
.bin file representation, so the on-disk format constraint that
governs renaming-vs-renumbering of existing codes doesn't apply —
but the hygiene rule still does, both for consistency and to keep
the WESL parity test honest.

The POI codes are **deliberately NOT added to `ALL_SOURCES`** (the
iteration list used to build `ALL_VISIBLE_MASK` for the points
pipeline's visibility bitmask). POIs don't render through the
points pipeline; they have their own renderer (`clusterMarkerRenderer`)
with its own visibility logic (`poiSubsystem.setCategoryVisible`).
Listing them in `ALL_SOURCES` would muddy the meaning of "this
bitmask filters survey galaxies."

#### Pick fragment

`clusterMarkerRenderer` issues one draw per category, each binding a
per-source uniform that carries the category's source code. The pick
fragment shader composes the packed identity the same way the points
pick path does:

```wgsl
// shaders/clusterMarker/ringPick.wesl
//
// `source.sourceCode` is the per-category uniform written by
// clusterMarkerRenderer at draw time (5 for cluster, 6 for SC, 7
// for void). PICK_SENTINEL_OFFSET = 1 keeps a true (code=5,
// poiIndex=0) Virgo hit distinguishable from cleared-zero.
return vec4<u32>(
  (source.sourceCode << 27u) | (poiIndex + PICK_SENTINEL_OFFSET),
  0u, 0u, 0u
);
```

#### Decode

`unpackPick` becomes a discriminated union keyed on the category:

```ts
export type PickResult =
  | { kind: 'galaxy'; source: Source; localIdx: number }
  | { kind: 'cluster'; poiIndex: number }
  | { kind: 'supercluster'; poiIndex: number }
  | { kind: 'void'; poiIndex: number };

export function unpackPick(rawPickValue: number): PickResult | null;
```

The bit math is unchanged. Only the dispatch on the decoded source
code changes — codes 5/6/7 fan out to their respective POI variants;
codes 0..4 map to galaxy hits; code 31 (or `rawPickValue === 0`) is
no-hit; codes 8..30 are unallocated at runtime (shouldn't appear; log
a warning and return `null` defensively).

Existing callers (one path in `wireInput`) get a discriminator they
must branch on; the type system enforces the new dispatch and makes
the "new POI hit" case syntactically visible at every call site.

### 6.3 Ring as the hit target

The POI ring is rendered into the pick buffer as a **screen-aligned
filled disk** at the ring's pixel radius, slightly larger than the
visible ring (e.g. +4 px) to provide a generous hit area — same
philosophy as `PICK_PADDING_PX` in the galaxy pick pass. The disk's
fragment writes the POI's packed identity; everywhere else the fragment
discards.

The halo billboard is **not** pickable (clicking through the soft glow
to a background galaxy is more useful than the alternative). Only the
ring is the hit surface, which lines up with what the user sees as
the "click target".

For voids: same — the ring is the hit target. Clicking inside the void
ring (but not on the ring itself) does not select the void; the user
must click the ring perimeter, mirroring how a cluster is clicked.

### 6.4 Depth and z-order

The POI ring pick pass uses the same `depth24plus` depth attachment
the galaxy pick pass uses, so a galaxy in front of a POI ring (e.g.
between camera and Virgo's centre) wins the pick. Order is "front-most
wins per pixel", matching the user's natural expectation.

## 7. Architecture and file inventory

### 7.1 New files

| Path | Purpose |
|---|---|
| `src/services/gpu/renderers/clusterMarkerRenderer.ts` | One renderer drawing both the halo billboard and the ring per POI. Instanced. Issues one draw per category (cluster / supercluster / void) so the pick fragment can read the category's source code (5 / 6 / 7) from a per-draw `SourceUniforms` block — same mechanism `pointRenderer` uses for the per-survey draws. |
| `src/services/gpu/shaders/clusterMarker/halo.wesl` | Additive radial-gradient billboard. Fragment alpha falls off smoothly across the quad. |
| `src/services/gpu/shaders/clusterMarker/ring.wesl` | Screen-aligned thin circle, 32 segments default. Vertex emits a ring on the cluster's tangent plane; fragment is solid colour modulated by ring alpha. |
| `src/services/gpu/shaders/clusterMarker/ringPick.wesl` | Pick-fragment variant of `ring.wesl`. Renders a filled disk into the r32uint buffer with `(source.sourceCode << 27) \| (poiIndex + PICK_SENTINEL_OFFSET)` — the category source code comes from the per-draw `SourceUniforms`, same pattern as `pickRenderer`'s galaxy path. |
| `src/utils/cluster/clusterMembership.ts` | Pure cone-search → `readonly number[]` of packed global indices. |
| `src/services/engine/subsystems/clusterFocusSubsystem.ts` | Tracks selected POI, computes/caches members, owns the `focusContrast` fade handle, writes focus uniforms each frame. |
| `src/services/engine/helpers/commitPoiFocus.ts` | Parallel to `commitFocus`: setSelected → onPoiFocusChange → optional tween. |
| `src/services/engine/camera/poiFocusTween.ts` | Per-category framing-distance helper (`poiFocusDistanceMpc(category, radiusMpc)`). |
| `src/@types/engine/state/FocusState.d.ts` | `{ poiId, memberIndices, center, radiusMpc, invert, active }` |
| `src/@types/engine/subsystems/ClusterFocusSubsystem.d.ts` | Public type for the new subsystem. |
| `src/@types/rendering/ClusterMarkerRenderer.d.ts` | Renderer type. |
| `tests/utils/cluster/clusterMembership.test.ts` | Unit tests for the pure cone-search. |
| `tests/services/engine/subsystems/clusterFocusSubsystem.test.ts` | Subsystem-level state-transition test. |
| `tests/services/engine/helpers/commitPoiFocus.test.ts` | Helper protocol test (mirror of `commitFocus.test.ts`). |

### 7.2 Edited files

| Path | Edit |
|---|---|
| `src/services/engine/subsystems/poiSubsystem.ts` | Remove `makeCrosshairLines`. Replace with a new `produceMarkers(): ClusterMarkerDescriptor[]` method consumed by `clusterMarkerRenderer`. Existing `produceLabels` is unchanged. |
| `src/services/gpu/shaders/points/vertex.wesl` | Add `@group(3)` `FocusUniforms { center: vec3<f32>, radiusMpc: f32, blend: f32, invert: u32 }`. Per-vertex: compute `inside = distance(p.position, focus.center) < focus.radiusMpc`. Apply alpha multiplier `lerp(1.0, inside == invert ? 1.0 : 0.08, focus.blend)`. See §8 sequence + the WESL conventions section below. |
| `src/services/gpu/shaders/points/colorFragment.wesl` | No change — the alpha multiplier rides on the existing `out.intensity`. |
| `src/services/gpu/renderers/pointRenderer.ts` | Build + bind `@group(3)` for the new `FocusUniforms` block. Write the buffer each frame from `clusterFocusSubsystem` state. The pick pipeline gets a dummy zeroed `FocusUniforms` (mirror of the existing dummy `FadeUniforms` pattern). |
| `src/services/gpu/renderers/pickRenderer.ts` | Add the dummy `FocusUniforms` bind group. Extend bind-group layout shape to match. |
| `src/data/sources.ts` | Append `Source.Cluster = 5`, `Source.Supercluster = 6`, `Source.Void = 7`. Each entry's docstring notes "POI-only — used for pick encoding, no .bin file representation, deliberately excluded from `ALL_SOURCES`." |
| `src/data/selectionEncoding.ts` | Refactor `unpackPick` to return a discriminated union (`PickResult`) with `galaxy \| cluster \| supercluster \| void` variants. Dispatch on the decoded source code (codes 5/6/7 → POI variants; 0..4 → galaxy; 31 / raw==0 → null; 8..30 → log + null). Bump the WESL parity test to cover the new codes. |
| `src/data/clusterAnchors.ts` | Rename `crosshairSizeMpc` → `physicalRadiusMpc` on the POI builders. The numerical values match (half-extent in Mpc), but document the new semantics: this field now drives the ring radius AND the member cone-search. |
| `src/@types/engine/subsystems/PointOfInterest.d.ts` | Rename field `crosshairSizeMpc` → `physicalRadiusMpc`. Update the JSDoc. Mark the rename in a migration note for any out-of-tree callers. |
| `src/@types/engine/handles/EngineCameraHandle.d.ts` | Add `focusOnPoi(poi: PointOfInterest): void`. |
| `src/@types/engine/EngineCallbacks.d.ts` | Add `onPoiFocusChange(poiId: string \| null): void` on `EngineCameraCallbacks`. |
| `src/services/engine/engine.ts` | Wire `focusOnPoi` onto the public handle (parallel to `focusOn`). |
| `src/services/engine/phases/wireInput.ts` | After `unpackPick` returns, branch on `result.kind`: galaxy → existing path; poi → `commitPoiFocus(state, cb, poi, { tween: doubleClick })`. |
| `src/services/engine/phases/wireSlots.ts` | Register the new `clusterFocusSubsystem` and `clusterMarkerRenderer` in the bootstrap. Subsystem teardown latch added to the destroy bag (~13 → 14 targets). |
| `src/components/InfoCard/InfoCard.tsx` (or sibling — confirm path during implementation) | New panel content for `category ∈ {cluster, supercluster, void}`: name, distance, type, physical radius, member count, "Fly here" button (triggers a tween). Reuses the existing card chrome. |

### 7.3 Files explicitly untouched

- `tools/catalog/*` — no bin format change.
- `src/data/galaxyCatalogFormat.ts` — v4 stays.
- `tools/auditCf4Anchors.ts` — still consumes `CLUSTER_ANCHORS`; the
  `physicalRadiusMpc` field is a runtime concept the audit doesn't read.
- `src/services/gpu/renderers/markerLineRenderer.ts` — keeps rendering
  the anchor-offset label lines + the youAreHere line.

## 8. Data flow

### 8.1 At-rest path

```
clusterAnchors.ts (data)
        │
        ▼
wireSlots.ts (bootstrap)  ──setPois──▶  poiSubsystem
                                              │
                       ┌──────────────────────┴────────────────┐
                       ▼                                       ▼
                produceLabels (existing)               produceMarkers (new)
                       │                                       │
                       ▼                                       ▼
                LabelRenderer                          clusterMarkerRenderer
                                                                 │
                                                                 ▼
                                                          halo.wesl + ring.wesl
                                                          (visible canvas)
                                                                 │
                                                                 └─▶ ringPick.wesl
                                                                    (offscreen pick texture)
```

Per-frame: `engine.ts` calls `poiSubsystem.produceLabels` and
`poiSubsystem.produceMarkers` once per frame inside the ready-frame
phase, hands the outputs to their respective renderers, and the
renderers emit one instanced draw each.

### 8.2 Focus-mode path

```
user click
    │
    ▼
canvas pointer handler  ──┐
                          ▼
                   pickRenderer.pick()  ──▶  unpackPick (typed-union dispatch)
                                                       │
                                  ┌────────────────────┴──────────────────┐
                                  ▼                                       ▼
                       kind: 'galaxy' (existing)                 kind: 'poi' (NEW)
                                  │                                       │
                                  ▼                                       ▼
                           commitFocus                          commitPoiFocus
                                                                          │
                                  ┌───────────────────────────────────────┤
                                  ▼                                       ▼
                       clusterFocusSubsystem.setSelected         cb.camera.onPoiFocusChange?.(poi.id)
                                  │                                       │
                                  ▼                                       ▼
                       computeClusterMembership (cached)         React: URL hash + InfoCard
                                  │
                                  ▼
                       fadeController.fadeTo({kind:'focusContrast'}, 1, 400)
                                  │
                                  ▼
                       per-frame: write FocusUniforms { center, radiusMpc, blend, invert }
                                  │
                                  ▼
                       points/vertex.wesl: per-vertex inside-test → alpha multiplier
                                  │
                                  ▼
                       canvas: members at full alpha, non-members at 8%
```

### 8.3 Frame-tail render-on-demand

The engine's existing "still animating" predicate already wakes on
mid-fade transitions. The new `focusContrast` fade handle hooks into
the same `fadeController`, so the predicate's `recentFade` check
covers it without any explicit changes to `renderScheduler`.

## 9. Mobile

The per-frame cost added by this spec is negligible:

- ~20 POIs × (1 halo quad of 6 vertices + 1 ring of 32 line segments
  × 2 triangles each) ≈ 700 vertices total. The renderer issues two
  instanced draws (one halo, one ring), both of trivial size.
- Focus mode is uniform-driven (one vec3 + two scalars + one u32 in
  `FocusUniforms`). The per-vertex inside-test is one vec3 subtract +
  one dot + one compare — comparable to the existing apparent-size
  projection cost.
- No per-frame allocations: the marker descriptors are produced from
  a pool reused frame-to-frame.

**One mobile-specific knob** worth mentioning: `ringSegments` could
drop from 32 → 16 to halve the ring's vertex count. At 20 POIs that
saves ~320 vertices per frame — not measurable. Implementer
discretion: ship 32 for everyone, revisit if a profile says otherwise.

## 10. Testing

### 10.1 Unit tests

- `tests/utils/cluster/clusterMembership.test.ts`
  - empty catalogs → empty result
  - single galaxy at exact `center + radius` distance → excluded
    (strict `<` predicate, not `≤`, so the ring is a hard edge)
  - single galaxy at `center + radius - 0.001` → included
  - two catalogs, one galaxy in each, only one in range → returns
    the in-range one only, with correctly-packed `(sourceCode <<
    27) | localIdx` identity
  - result is frozen (defensive `Object.freeze` on the returned array)
- `tests/data/selectionEncoding.test.ts` (extend existing)
  - `unpackPick` discriminator: source 30 → `{kind:'poi'}`, source 0..29
    → `{kind:'galaxy'}`, source 31 → null
  - `packPoiIdentity(0)` round-trips through `unpackPick`
  - parity with WESL `selectionEncoding.wesl` (existing pattern)

### 10.2 Subsystem tests

- `tests/services/engine/subsystems/clusterFocusSubsystem.test.ts`
  - `setSelected(poi)` starts a fade and writes uniform state
  - `setSelected(null)` reverses the fade and zeroes invert flag
  - `setSelected(poi)` twice in a row with the same POI is a no-op
    (no spurious re-fade, no recomputation)
  - tier-swap invalidation: when `dataRev` bumps, the cached
    `memberIndices` array is dropped and recomputed on next access
  - void selection sets `invert: 1`; cluster/SC selection sets
    `invert: 0`

### 10.3 Helper tests

- `tests/services/engine/helpers/commitPoiFocus.test.ts`
  - `{tween: false}` calls setSelected + onPoiFocusChange but NOT
    tweenToGalaxy
  - `{tween: true}` calls all three in order
  - call order is asserted via a mock-call recorder (subsystem → cb
    → tween), matching the existing `commitFocus.test.ts` style

### 10.4 Snapshot tests

- `tests/services/engine/subsystems/poiSubsystem.test.ts` (extend)
  - `produceMarkers` returns expected descriptors per category
    (cluster: halo + ring; supercluster: halo + ring; void: ring only;
    famousGalaxy: empty array — the legacy crosshair is gone for all
    categories)

### 10.5 Visual verification

Per `CLAUDE.md`, visual verification is user-driven. After
implementation, the user spot-checks in the dev server:

- Virgo: yellow halo + ring at ~2 Mpc, visible from 1 Gpc out as a
  speck, grows to fill the screen on close approach, then fades.
- Hercules SC: bigger, more diffuse halo + ring.
- Boötes Void: cyan ring only.
- Click Virgo's ring → InfoCard opens, surrounding 2MRS/GLADE galaxies
  outside Virgo fade to 8%.
- Click Boötes Void's ring → galaxies INSIDE the ring fade; the
  wall structure around it stays bright.
- Click empty sky → focus mode exits with a 400 ms fade.

## 11. Open decisions flagged for the implementer

1. **`focusDistanceMpc` extension vs. new `poiFocusDistanceMpc` helper.**
   Spec recommends Option B (new helper) for separation of concerns;
   Option A is simpler if the implementer prefers to keep the helper
   surface minimal. See §5.3.

2. **Ring segment count (32 vs. 16 default).** Spec ships 32 to favour
   visual smoothness; mobile may not need the extra fidelity but it's
   not measurable. The implementer may pick either default; making it
   per-category-tunable adds knobs for negligible benefit at v1.

3. **InfoCard panel layout for POIs.** Reuse the existing `InfoCard`
   chrome with a category-keyed body slot, or split out a new
   `ClusterInfoCard` component? Reuse is simpler and matches the
   existing "one card, content varies" pattern; split-out is cleaner
   if the POI body diverges substantially. Defer to the implementer
   after a quick mock.

4. **"Camera follows focus" settings toggle.** Currently the
   double-click is the only camera-tweening gesture; single-click
   opens InfoCard without moving the camera. A future settings toggle
   could make every click tween. For v1: ship without the toggle;
   the dual-gesture convention matches galaxies and is discoverable.

5. **`physicalRadiusMpc` semantics on famous-galaxy POIs.** Famous
   POIs today don't set `crosshairSizeMpc`. After the rename, they
   continue to omit `physicalRadiusMpc`. The membership cone-search
   would be undefined for a famous-galaxy click — but since famous
   POIs route through `selectFamous` (not `commitPoiFocus`), this
   path is never reached. Confirm during implementation that the
   pick dispatch never sees a famous POI as a "POI hit" (famous
   galaxies are still galaxies in the pick buffer; they have a
   regular sourceCode/localIdx).

6. **Membership predicate strictness (`<` vs `≤`).** Spec uses
   strict less-than so the ring is a hard outer edge. A galaxy
   sitting exactly at `r == radiusMpc` is excluded. Acceptable for
   v1; revisit if a real anchor sits suspiciously on the boundary.

## 12. Out of scope

- **Famous-galaxy POIs.** Already have thumbnails + curated labels;
  the new halo/ring/focus treatment doesn't apply. They keep their
  current behaviour wholesale.
- **Build-time membership precompute.** Runtime cone search is
  cheap enough and avoids a bin format bump. Revisit only if a
  profile shows real cost.
- **Cluster-membership scientific accuracy.** The cone search is
  a sphere in 3D Cartesian distance; real cluster membership
  involves redshift-space distortions, velocity cuts, and
  Abell-catalog cross-matching. The visual is *iconic, not
  authoritative*. The InfoCard text should not say "member galaxies"
  in a way that implies catalog membership — phrasing like
  "galaxies within 2 Mpc of the centre" is honest and avoids the
  trap.
- **Tour mode / playlist of clusters.** A guided "fly between
  these N POIs" mode is a follow-up spec.
- **Settings panel knobs** for the focus-mode alpha values, the
  fade duration, or the per-category framing multipliers. All
  constants for v1; promote to settings only if a real user
  workflow demands tuning.
- **Custom user POIs.** Adding a POI at runtime (saved-views style)
  is not part of this spec.
- **Cross-cluster visual relationships.** No lines between Hercules
  cluster and Hercules SC; no shaded "this cluster is inside this
  supercluster". One halo + one ring per POI, full stop.

## WESL conventions reminder (for the implementer)

The new shader files `halo.wesl`, `ring.wesl`, `ringPick.wesl` and the
edit to `points/vertex.wesl` are subject to the WESL conventions
already established in `points/io.wesl` + `points/vertex.wesl`:

- Use `?static` imports (`import code from './foo.wesl?static';`) on
  the TS side and `import package::path::Symbol` syntax on the WESL
  side. The wesl-plugin Vite linker resolves the literal `package::`
  prefix; never use a relative WESL path.
- `@group(N) @binding(M)` declarations are module-local — re-declare
  the binding in every module that reads the buffer, using the same
  struct imported from a single authoritative `io.wesl`-style file.
  Declare `FocusUniforms` in a new `shaders/lib/focusUniforms.wesl`
  and import it from `points/vertex.wesl` + `halo.wesl` +
  `ring.wesl`.
- Never share `GPUShaderModule` instances across pipelines. Each
  pipeline compiles its own module from the same source.
- The CameraUniforms prefix (`viewProj` + `viewportPx` + two pad
  slots, 80 bytes) is the canonical leading struct of every
  pipeline's `@group(0)` uniform. Reuse it for `clusterMarkerRenderer`'s
  uniform block — don't invent a new camera layout.
- Add a parity test (`tests/services/gpu/shaders/clusterMarker/*.test.ts`)
  that asserts the focus-uniform byte layout matches between the
  TS-side `writeBuffer` calls and the WESL struct.
