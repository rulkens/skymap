# Inside-atmosphere rendering — design

> **Status.** Ratified by the user; ready to plan.
> **Date.** 2026-08-24.
> **Relationship to prior work.** Builds on the shipped
> [Atmosphere constituents](completed/2026-08-18-atmosphere-constituents-design.md)
> (the three-LUT Bruneton/Hillaire pipeline, the shell renderer, the two-pass
> multiply/add composite). Absorbs
> [`docs/backlog/2026-08-20-inside-atmosphere-rendering.md`](../../backlog/2026-08-20-inside-atmosphere-rendering.md)
> and
> [`docs/backlog/2026-07-29-in-atmosphere-haze.md`](../../backlog/2026-07-29-in-atmosphere-haze.md)
> (deleted by this change, per §8), plus two smaller adjacent findings (§5).

## 1. Problem

The atmosphere shell (`atmosphereShellLayer.ts`) draws a proxy sphere scaled
to `atmosphereTopKm`. Its fragment splits duty by `front_facing`: the near
(front) wall carries over-disc haze, the far (back) wall carries the limb +
sky (`shell/fragment.wesl:12–26`). Once the camera crosses inside the shell,
the near wall's triangles are all behind the eye — no front faces rasterise —
so the haze branch gets no fragments. The far wall still draws (down-looking
rays lose their haze; the limb/sky survive), and the header already documents
this as accepted for the outside-looking-in regime
(`shell/fragment.wesl:28–31`).

The camera can reach deep inside the shell today: `SURFACE_STANDOFF_RADII` is
`1.0000024` (~15.3 m above Earth's surface,
`src/utils/camera/clampDistance.ts:47`), a hundred kilometres inside a
100 km-thick shell. Descending through it, the sky vanishes discontinuously
at the boundary instead of thickening into a day-sky dome the way a real
atmosphere would.

## 2. Ratified decisions

- **Approach: full-screen shell reuse.** When `hypot(camPosLocal) < 1` (the
  camera inside the atmosphere-top unit sphere, in the shell's own local
  frame), swap the proxy-sphere draw for a full-screen triangle running two
  new fragment entry points through the SAME LUTs, uniforms, and two-pass
  multiply/add compositing. The froxel aerial-perspective volume named in
  `atmosphereShellLayer.ts`'s header (per-pixel scene-depth-aware haze on
  arbitrary occluders) stays the deferred upgrade — this feature does not
  attempt it, and the header's note stays intact.
- **Sun: no bespoke glare pass.** The Sun disc is `starSpheresLayer`'s
  resolved sphere, drawn into `foreground:0` BEFORE the atmosphere shell
  (`frameProgram.ts:140`, `{ kind: 'render', target: 'foreground:0', slab:
NEAR0 }`). The shell's multiply pass already attenuates whatever is behind
  it per channel, so sunset reddening of the disc falls out of the existing
  order — inside or outside the shell, nothing about the Sun's own draw path
  changes.
- **Day-sky washout rides the existing compositor-alpha path.** No CPU
  washout scalar, no per-layer fade edit. Mechanism (§4.3).
- **Cloud deck seen from below: IN scope, fixed on this branch.** Reversed
  from an earlier "defer to backlog" framing — see §5c.

## 3. Ground preparation

None needed — every touchpoint is growth at an existing seam, not a
restructure. The sketch:

- Two new fragment entry points, `fsInsideMultiply`/`fsInsideAdd`, beside the
  existing `fsMultiply`/`fsAdd` in `shell/fragment.wesl` — growth, same file,
  same shared `sampleShell`-style predicate.
- Two new pipelines over the SAME `shellPipelineLayout`, shared bind groups,
  and shared per-body LUT bundles (`atmosphereShellRenderer.ts:292–338`) —
  growth, not a second renderer.
- `AtmosphereUniforms` grows one `mat4` (`invMvp`): 112 → 176 bytes. §5b
  renames byte 92's field from `sunIrradiance` to a plain unnamed pad but
  does not remove the byte — it is structural vec3-tail alignment, not
  content — so the struct's total size is unaffected by §5b and stays at
  176 bytes after both changes. Read only by the inside entry points but
  packed uniformly for every body — at ≤9 atmosphere bodies per frame the
  extra 64 bytes each is noise. A separate inside-only uniform buffer was
  considered and ruled out: one struct, one packer, one byte-layout
  contract to keep in sync beats two.
- `draw()` gains an inside-mode argument. The inside/outside split is a NEW
  discriminant (which pipeline pair to bind), not a second branch bolted onto
  an existing one — `draw()`'s existing multiply-then-add ordering is
  unchanged, only which pair of pipelines it runs.

Two divergences surfaced and resolved during ground-prep cross-checking:

1. **An explicit washout scalar in a shared bind group — rejected.** The
   incumbent compositor-alpha path (§4.3) already produces the same visual
   result and already exists; a second, parallel washout control would be a
   second currency for the same effect.
2. **A shared per-frame `BodyProximity` map for every altitude consumer —
   rejected as speculative.** `camPosLocal` is already computed in
   atmosphere-top units at both consumers this feature touches
   (`atmosphereShellLayer.ts:113`, `encodeAtmosphereSkyView.ts:90`), so
   `hypot(camLocal) < 1` gives `inside` in one comparison at each call site —
   no shared map earns its keep for two call sites (this pair is hoisted
   instead — see §5a). The three inline `distance − radius` altitude sites
   (`baseGlobeFadeAlpha.ts`, `cloudDeckFade.ts`, `slabs.ts:152`) use the
   SURFACE radius and different anchors from this feature's atmosphere-top-radius
   test, and stay as they are — folding them into a shared abstraction with a
   different unit and a different anchor would be the kind of "must remember
   which case this is" knot `simplicity.md` flags, not a simplification.

## 4. Design

### 4.1 Trigger

`atmosphereShellLayer.draw` already computes `camLocal =
camPosLocal(view.camPos, positionMpc, atmosphereTopMpc, orientation)`
per entry (`atmosphereShellLayer.ts:113`) — the camera in atmosphere-top-radius
units, sphere centred at the origin. `hypot(camLocal) < 1` is the inside test,
computed once per body per frame at that existing call site; no new
per-frame derivation.

### 4.2 Pass swap + ray reconstruction

Outside the shell, `draw()` runs the proxy-sphere geometry through
`fsMultiply`/`fsAdd` exactly as today. Inside, it runs the SAME two-pass
multiply-then-add order (`atmosphereShellRenderer.ts:612–620`'s ordering
invariant is unchanged) but over the covering-triangle vertex stage
(`lib/fullscreenTri.wesl`) instead of the uv-sphere mesh, through
`fsInsideMultiply`/`fsInsideAdd`.

`lib/fullscreenTri.wesl`'s `fullscreenVertex` is not itself a `@vertex` entry
point — the WESL linker does not guarantee an imported entry point's name
survives inlining, so every consumer declares its own two-line `@vertex fn
vs` wrapper calling it (the header's documented pattern, already followed by
`compositor/vertex.wesl` and the bloom shaders). The shell's inside vertex
stage follows the same shape.

Per fragment, the inside entry points unproject the fullscreen triangle's
screen position through `invMvp` (clip space → the shell's unit-sphere local
frame) to reconstruct a ray, exactly the way `fsMultiply`/`fsAdd` already
derive `dir = normalize(localPos − camPosLocal)` from the interpolated proxy
vertex (`shell/fragment.wesl:148`) — the inside path substitutes an unprojected
screen ray for the mesh-interpolated one, then hands off to the SAME
`sampleShell` logic: the same `raySphere` march bound, the same
ground-occlusion clamp, the same two LUT lookups, the same ring-in-front
branch, the same `ShellSample.hit` discard predicate.

**No wall split from inside.** `sampleShell`'s `front_facing` wall-duty split
(`shell/fragment.wesl:168–181`) exists to keep the two-walled proxy's near
and far triangles from double-counting the limb. A full-screen pass has no
"wrong wall" — every fragment is exactly one ray from the eye — so the inside
entry points skip the split entirely and evaluate every fragment. `ShellSample.hit`
still discards a fragment whose ray misses the atmosphere-top sphere
outright (never true for a camera already inside the top sphere, since
`raySphereRoots`'s `top.y` is always ≥ 0 from an interior origin — kept as
the same shared predicate anyway, no special-cased always-hit branch).

### 4.3 Washout mechanism (no bespoke code)

`fsMultiply`/`fsAdd` already write `coverage = 1 − luminance(transmit)` into
alpha (`shell/fragment.wesl:265,292`), and the shell composites into
`foreground:0`, which the frame program composites OVER `hdr` in straight
Porter-Duff alpha (`frameProgram.ts:140–141`,
`{source:'foreground:0',dest:'hdr',blend:'over',tone:null}`; blend table in
`compositor.ts:159–165`) — AFTER every star, Milky Way, and galaxy layer has
already accumulated into `hdr` (`frameProgram.ts:105,132` land the COSMO and
NEAR0 `hdr` render steps before the `foreground:0→hdr` composite).

Today's proxy has no fragments off the disc/limb silhouette, so bright day
sky never reaches full-frame coverage and washout never triggers. A
full-screen inside pass has a fragment at every pixel: over bright day sky
`coverage → 1` (near-opaque transmit-complement), so the `over` blend all but
replaces whatever star/galaxy light was already in `hdr` at that pixel;
toward the night side `coverage` falls back toward 0 and the pre-composited
starfield reads through unchanged. This is the SAME mechanism that already
makes the outside-shell limb glow occlude background stars — inside simply
gives it fragments everywhere instead of only on the disc.

Accepted consequences, stated because the mechanism is genuinely
image-space and body-uniform:

- Washout is uniform over everything already in `hdr` at that pixel,
  including famous galaxies — a day sky washes out a background galaxy the
  same way it washes out a star. This is physically correct (a bright sky
  drowns anything fainter behind it) and is the existing compositor
  contract, not a new one this feature introduces.
- Layers drawn AFTER the `foreground:0→hdr` composite (swap-chain overlays —
  labels, captions) are untouched by construction: they never pass through
  `hdr`, so the shell's coverage never touches them. Deliberate — a label
  reads the same whether the sky behind it is day or night.

### 4.4 Depth resolution

From inside the shell, every other atmosphere-bearing body is beyond this
body's own shell, and ground occlusion is already analytic in the fragment
(the `raySphere` ground clamp, `shell/fragment.wesl:160–166`) — nothing needs
a per-fragment depth comparison against another draw's stamped z to get
occlusion right for the sky/haze itself.

**Recommendation: `depthCompare: 'always'`, no `frag_depth` write, for the
inside pipelines.** Writing `@builtin(frag_depth)` disables early-Z for that
pipeline (`lib/analyticSphere.wesl:84`, the `fragDepthFromLocal` header) — a
cost worth avoiding on a pass that already covers the whole screen. The
`fragDepthFromLocal` shape stays the documented fallback (not exercised by
this feature) if a real occlusion case turns up later — e.g. a moon transit
seen from inside the shell needing to sit in front of the sky at its true
depth rather than behind everything. That case is not expected: the analytic
ground clamp already handles the one occluder (this body's own surface) an
interior camera can see, and any other body's foreground draw already
stamped `foreground:0`'s depth before this shell's inside pass runs, so the
inside pass drawing depth-`always` over it is exactly the existing outside
shell's contract (test against, never write) minus the test, since inside
there is nothing closer than the eye to test against.

### 4.5 Seamlessness at the crossing

By construction, not by blending logic: the trigger (§4.1) is a hard switch
on `hypot(camLocal) < 1`, but both sides evaluate the identical `sampleShell`
integral against the identical LUTs. `tNear = max(0, top.x)`
(`shell/fragment.wesl:157`) already clamps the march start to the camera when
it is inside the top sphere — this clamp was written for the outside-shell
far-wall case (a ray whose analytic entry point is behind the eye) and
already produces the correct "camera-inside" integral without change; the
inside full-screen pass exercises the same clamp from every pixel rather
than from the far wall alone. The sky-view LUT is baked per-frame at the
actual camera position/altitude regardless of proxy vs. full-screen
(`encodeAtmosphereSkyView.ts` computes `viewHeightKm`/`sunZenithCos` from the
same `camPosLocal`/`sunDirLocal` §4.1 reads), so low-altitude sky hue is
already correct on both sides of the boundary — nothing about the LUT
content changes at the crossing, only which geometry samples it.

### 4.6 Invariant: the draw-list does not need to change

`atmosphereDrawList`'s sub-pixel cull measures the body's SURFACE diameter
(`atmosphereDrawList.ts:59–65`), and a camera inside the shell is also inside
the body's disc, so its apparent size is enormous — it trivially clears the
cull. The `distanceMpc === 0` escape hatch (`atmosphereDrawList.ts:46–58`)
already exists for the camera-at-centre degenerate case. No draw-list change
is expected; this should be verified as an explicit test property (§9), not
assumed.

## 5. Adjacent work on this branch

Three smaller findings ride this branch as their own commits, sequenced
around the feature commits rather than filed to the backlog — each is small,
each touches files this feature already has open, and none changes the
feature's own design in §4.

### 5a. Hoist the atmosphere pair of per-body derivations

`atmosphereShellLayer.draw` and `encodeAtmosphereSkyView` each independently
recompute `camPosLocal`/`sunDirLocal` per body, per frame
(`atmosphereShellLayer.ts:96–113`, `encodeAtmosphereSkyView.ts:90–96`) — two
call sites deriving the same pair from the same five inputs
(`view.slab.vp`/`ctx.drawCamPos`, `positionMpc`, `RENDER_ORIGIN_MPC`,
`atmosphereTopMpc`, `orientation`), the same shape
`docs/backlog/2026-08-20-hoist-solar-system-derivations.md` names for
`sceneBodyPartition`/`partitionStarsByResolution`/`atmosphereDrawList`/`drawableRings`.
`atmosphereDrawList` itself also computes a per-body distance
(`atmosphereDrawList.ts:46–49`) purely to gate the sub-pixel cull, then
discards it — the same compute-then-discard shape that backlog item's title
names.

One hoist commit: extract the shared `camPosLocal`/`sunDirLocal` pair into
`atmosphereDrawList`'s existing per-frame walk (it already resolves
`positionMpc`/`orientation` once per body via `sceneBodyStates`), so both
`atmosphereShellLayer.draw` and `encodeAtmosphereSkyView` read the memoised
pair off the SAME `AtmosphereDrawEntry` instead of re-deriving it — mirroring
the `prepareStarCut`-style pattern the backlog item names as the target
shape. `docs/backlog/2026-08-20-hoist-solar-system-derivations.md` stays open
for its other four derivations (unrelated files, unrelated call sites); this
branch only closes the atmosphere pair, recorded as an appended line rather
than a delete (§8).

### 5b. Delete the `sunIrradiance` named pad

`AtmosphereUniforms` byte 92 fills `camPosLocal`'s vec3 tail
(`packAtmosphereUniforms.ts:41`). It was given a physical-sounding name and a
field grew backward to feed it — `AtmosphereParams.sunIrradiance`, `1.0` in
all nine rows (`atmosphereParams.ts:57,100,143,173,216,277,321,371,425`),
threaded through `atmosphereShellLayer.ts:141` — but no fragment reads
`u.sunIrradiance`; the shell reads `exposure`, `bottomRadius`, `camPosLocal`,
and the ring ratios. The byte itself is structural (16-byte vec3 alignment)
and stays; the named field pretending to be a live dial does not.

**The lean call: delete the decoy, don't wire it up.** A real per-body
solar-irradiance falloff (irradiance genuinely scales ~1/r²; Pluto's is
~1/1560 of Earth's) is a feature, not a cleanup — it would need the LUTs
themselves to agree, which this branch does not touch. This commit:

- Drops `sunIrradiance` from `AtmosphereParams` and all nine authored rows.
- Renames the byte-92 packer parameter/comment to a plain unnamed pad (no
  field pretending to be live).
- Drops the argument from `atmosphereShellLayer.draw`'s call into
  `packAtmosphereUniforms`.

Its own commit, independent of the inside-shell feature work, landing
wherever sequencing is convenient (before or after the feature commits — it
touches the same struct §3's `invMvp` growth touches, so landing it first
avoids editing the byte-offset table twice).

### 5c. Fix the cloud deck's interior vanishing

Reversed from an earlier "defer to backlog" framing. The cloud shell is a
CLOSED sphere drawn with `cullMode: 'back'`
(`cloudShellRenderer.ts:248–251`) — every triangle culls once the camera sits
inside it, the same class of bug the atmosphere shell itself had before this
feature, but with no `front_facing` duty split to fall back on: the deck
simply vanishes rather than degrading to a partial view.

**This is coupled, not independent, and the spec records the coupling
honestly.** Fixing the cull mode alone changes nothing visible: `cloudDeckFade`
(`src/utils/scene/cloudDeckFade.ts`) already fades the deck to 0 by
`CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii` (0.037 Earth radii, ≈ 238 km,
`cloudShellParams.ts:94,99`) — an altitude band tuned for tile-LOD crossover
(the deck's whole-globe job handing off to fine surface tiles), which happens
to also mask the interior-vanish bug, for an unrelated reason. A visible
overcast-from-below effect needs BOTH: the cull/two-sided-draw fix, AND
revisiting `fadeEndAltitudeRadii`'s low-altitude behaviour so the deck is
still present as the camera descends through it rather than faded to
nothing before the cull fix ever gets a chance to matter. The fix sketch —
front-cull instead of back-cull, or a two-wall duty split from inside
mirroring §4.2's shape — and the fade-band re-tuning are one visual outcome,
so they land as one commit with its own visual QA line (§9).

## 6. Out of scope

- The froxel aerial-perspective volume (arbitrary-occluder, per-pixel-depth
  aerial haze) — the named later upgrade, unchanged from
  `atmosphereShellLayer.ts`'s header.
- A bespoke sun-glare/bloom pass for in-atmosphere sunsets — rides the
  existing multiply-pass attenuation.
- Non-Earth atmosphere bodies get a sanity pass, not a tuning pass — Earth is
  the reference; Mars/Titan get a visual check (§9), not per-body exposure
  tuning.
- Any change to `atmosphereDrawList`'s cull rules, the LUT bake
  dimensions/cadence, or a real per-body solar-irradiance falloff (§5b names
  this as future work, explicitly not this branch's).

## 7. Landmines

- **Shared discard predicate, both passes.** `fsMultiply`/`fsAdd` must
  discard from the SAME `ShellSample.hit` — the inside entry points inherit
  this from `sampleShell` unchanged, but a future edit that forks the two
  passes' hit tests would double-count or drop pixels exactly the way the
  outside shell's wall split would (`shell/fragment.wesl:78`).
- **Ring mix, never multiply.** `out.transmit = mix(vec3(1), segTransmittance,
ringVis)` (`shell/fragment.wesl:263`) — multiplying by `ringVis` instead
  would drive the multiply pass to black wherever a ring in front is opaque,
  the inverse of masking the shell off. Unchanged by this feature, but the
  inside path re-runs the exact same line, so a "clean it up" refactor that
  touches this rule must touch it in one place, not two.
- **Two-pass order is load-bearing.** MULTIPLY before ADD, both outside and
  inside — reversing it attenuates a body's own newly-added in-scatter by its
  own transmittance (`atmosphereShellRenderer.ts:612–616`).
- **Renormalize after the implicit model transform.** `dir = normalize(...)`
  is required because the proxy is a scaled sphere (`shell/fragment.wesl:145–147`)
  — the inside path's unprojected ray needs the same renormalize after the
  `invMvp` unproject, for the same reason (a non-uniform scale in the
  composed transform).
- **`mat4d` inverse: f64 wrapper, dst-last.** `wgpu-matrix`'s f64 API
  (`mat4d`, already in use for `composeBodyMvp`/`rebaseViewProj`) takes its
  destination array last and returns `Float64Array` — the same convention
  those two files already follow. `invMvp` is computed CPU-side from the
  same composed `mvp` `composeBodyMvp` already returns, narrowed to f32 only
  at the `packAtmosphereUniforms` write, mirroring how `mvp` itself is
  narrowed today (`atmosphereShellLayer.ts:136–137`, `narrowMat4(mvp)`).
- **iOS: one bad pipeline drops the whole frame.** All HDR passes share one
  command encoder; an invalid pipeline makes `queue.submit()` silently drop
  the entire frame with no thrown error (docs/RENDERER.md's iOS landmine).
  Build the two new pipelines through `createShaderModuleWithDevLog`, as
  every existing atmosphere pipeline already does.
- **`writeBuffer` immediately before its own draw.** `draw()`'s existing
  per-body pattern — write this body's own uniform buffer right before
  drawing it, never a shared buffer another body's write could race
  (`atmosphereShellRenderer.ts:605–608`) — extends unchanged to the inside
  mode; the grown `AtmosphereUniforms` struct still writes once per body,
  once per frame, same call site.
- **Descent-fade overlap, not a new bug.** `EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM`
  = 300, `EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM` = 150
  (`src/data/bodies/earthTileParams.ts:77,81`) overlap the 100 km-thick
  atmosphere shell. Expect a tuning pass against the new inside-shell sky,
  not a redesign of either fade.
- **§5b lands before or with §3's byte-offset growth.** The `AtmosphereUniforms`
  table changes twice in close succession (pad rename, then `invMvp` growth)
  — sequence §5b first so the byte-offset table in `packAtmosphereUniforms.ts`
  is edited once against a clean 112-byte baseline, not twice.

## 8. Backlog edits (this change)

- Deleted `docs/backlog/2026-08-20-inside-atmosphere-rendering.md` and
  `docs/backlog/2026-07-29-in-atmosphere-haze.md` — both absorbed by this
  spec. Their `docs/BACKLOG.md` index lines removed in the same change.
- Deleted `docs/backlog/2026-08-18-atmosphere-sun-irradiance-named-pad.md` —
  consumed by §5b, which does the lean fix (delete the decoy) rather than the
  backlog item's "wire it up" alternative. Its `docs/BACKLOG.md` index line
  removed in the same change.
- Appended one line to
  `docs/backlog/2026-08-20-hoist-solar-system-derivations.md` noting that
  this spec's branch (§5a) hoists the `camPosLocal`/`sunDirLocal` pair for
  the two atmosphere consumers; the item's other four derivations
  (`sceneBodyPartition`, `partitionStarsByResolution`, the remainder of
  `atmosphereDrawList`/`drawableRings`) are untouched and the item stays open
  for them.
- No new backlog file created — §5c (cloud deck from below) is fixed on this
  branch, not filed.

## 9. Testing

Judge every test by whether it would catch a real bug — no constant
restatements, no runtime type checks (`docs/superpowers/conventions/testing.md`).

**Unit:**

- Inside-test threshold: `hypot(camPosLocal) < 1` at values straddling 1.0
  (e.g. 0.999 inside, 1.001 outside) — the boundary condition the trigger
  depends on.
- `packAtmosphereUniforms`'s grown byte layout: the new `invMvp` field lands
  at the documented offset, and the existing fields (mvp, sunDirLocal,
  bottomRadius, camPosLocal, exposure, ring ratios) keep their current
  offsets after §5b's pad rename — a regression here silently mis-indexes
  the GPU struct.
- `invMvp` inversion sanity: inverting a known `mvp` and unprojecting a known
  clip-space point recovers the expected local-frame ray, catching a
  dst-last/f64-wrapper mistake before it reaches the GPU.
- §5a's hoist: `atmosphereShellLayer.draw` and `encodeAtmosphereSkyView`
  read byte-identical `camPosLocal`/`sunDirLocal` off the shared derivation —
  a pure-refactor assertion, mirroring the earth-RTC spec's precedent for
  the same shape of extraction.

**Pipeline-descriptor tests** (extending
`tests/services/gpu/renderers/atmosphere/atmosphereShellRenderer.test.ts`'s
existing harness):

- The two inside pipelines share `shellPipelineLayout` with the outside pair
  (same bind-group layout, same LUT/uniform bundle).
- Correct blends: `fsInsideMultiply` gets the `zero`/`src` multiply blend,
  `fsInsideAdd` gets the `one`/`one` add blend — same table as the outside
  pair.
- Both inside pipelines discard from the same predicate (source-level check —
  both entry points call the same `sampleShell` and both branch on
  `!s.hit`).
- Depth profile matches §4.4's ruling: `depthCompare: 'always'`,
  `depthWriteEnabled: false`, no `frag_depth` in the inside fragment's
  output.

**Invariant test:** `atmosphereDrawList` still includes Earth when the
camera position is deep inside the shell (§4.6) — a regression here would
silently blank the sky rather than fail loudly.

**Visual (user's eyes, dev server):**

- Earth descent through the shell boundary, day side: haze thickens into a
  full sky dome, no pop or gap at the crossing.
- Earth descent, night side: stars visible near the boundary, none once deep
  inside if sun-lit, back once past the terminator into shadow.
- Star washout: bright day sky hides stars/Milky Way/galaxies behind it;
  night side keeps them visible; no washout artifact on the swap-chain label
  layer.
- Mars and Titan: a sanity pass only — correct hue and no crash/blank frame
  when the camera enters their shells, not a tuning pass.
- §5c: overcast reads correctly from below the cloud deck at low altitude —
  both the cull/two-sided fix and the re-tuned `fadeEndAltitudeRadii` are
  needed for this to be visible at all (see §5c's coupling note); check the
  deck neither vanishes early nor pops at the old ~238 km edge.

**Perf:** `npm run perf` before/after, per the `perf` skill (measure against
this worktree's own dev-server URL). The inside pass adds a full-screen draw
per atmosphere body in view; if `frag_depth`/`always`-compare loses early-Z
somewhere it wasn't expected, that should show up here, not be assumed away.
§5c's cull/fade change is a separate perf checkpoint (cloud shell now
potentially double-sided at low altitude).

## 10. Interactions

- **Descent fades.** `EARTH_BASE_GLOBE_FADE_*` (§7) overlaps the shell depth;
  no redesign, a tuning pass once the inside sky is visible to tune against.
  `cloudDeckFade`'s `fadeEndAltitudeRadii` is a second, related re-tune under
  §5c.
- **Sun disc.** No change to `starSpheresLayer`'s draw path or ordering;
  the shell's existing multiply-pass attenuation is the whole mechanism
  (§2, §4.3).
- **Labels/captions.** Drawn on the swap chain after the `hdr→swap` tone-map
  composite, never through `hdr` — exempt from the washout mechanism by
  construction (§4.3), not by a special case added for this feature.

## References

- `src/services/engine/frame/passes/atmosphereShellLayer.ts` — the layer;
  §4.1's trigger point, §2's Sun-ordering claim, §5a/§5b's touchpoints.
- `src/services/engine/frame/atmosphereDrawList.ts` — §4.6's invariant, §5a's
  hoist target.
- `src/services/engine/frame/encodeAtmosphereSkyView.ts` — §4.5's LUT-bake
  claim, §5a's second hoist site.
- `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts` —
  pipelines, bind groups, `draw()`'s write-then-draw pattern (§7).
- `src/services/gpu/shaders/atmosphere/shell/{vertex,fragment}.wesl` — the
  reused integral, the wall split being skipped inside (§4.2), the landmines
  in §7.
- `src/services/gpu/shaders/lib/fullscreenTri.wesl` — the full-screen
  vertex precedent (§4.2).
- `src/services/gpu/shaders/lib/analyticSphere.wesl` — `fragDepthFromLocal`,
  the frag-depth/early-Z tradeoff cited in §4.4.
- `src/services/engine/frame/frameProgram.ts` — the `foreground:0→hdr` composite
  step order (§4.3).
- `src/services/gpu/passes/compositor.ts` — the `over` blend table (§4.3).
- `src/utils/gpu/packAtmosphereUniforms.ts` — the byte layout §3/§5b/§9 touch.
- `src/data/bodies/atmosphereParams.ts` — the nine `sunIrradiance: 1.0` rows
  §5b drops.
- `src/utils/camera/clampDistance.ts` — `SURFACE_STANDOFF_RADII`, the
  reachability fact in §1.
- `src/data/bodies/earthTileParams.ts` — the descent-fade constants in §10.
- `src/utils/scene/cloudDeckFade.ts`, `src/data/bodies/cloudShellParams.ts`,
  `src/services/gpu/renderers/bodies/cloudShellRenderer.ts` — §5c's coupling.
- Absorbed backlog items (deleted by this change):
  `docs/backlog/2026-08-20-inside-atmosphere-rendering.md`,
  `docs/backlog/2026-07-29-in-atmosphere-haze.md`,
  `docs/backlog/2026-08-18-atmosphere-sun-irradiance-named-pad.md`.
- Touched, not deleted: `docs/backlog/2026-08-20-hoist-solar-system-derivations.md`
  (§5a appends a line; the item's other four derivations stay open).
