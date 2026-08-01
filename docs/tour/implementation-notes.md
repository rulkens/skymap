# Tour — implementation notes

Running log of issues/gotchas building `grandTour` ("The Long Way Out").
Newest first. Primitives: [`../animation/clip-primitives.md`](../animation/clip-primitives.md).

## Reference

- `Tour` = `{ id, label, beats[] }` → registered in `tourRegistry.ts`.
- `BeatData` = `{ caption, enterClip?, dwellClip }`. Focus lives in the enterClip (`focus(id)`), not the beat. `enterClip` (the establishing move) is optional — omit it when the previous beat already framed the subject; the dwell then starts at once.
- Clips: `flyToClip(id)` (camera), `flyAndFocusOnClip(id)` (camera + isolate, = `focusOnId` composite), or hand-authored `flyPath([...])`.
- Grand-tour clips live one-per-file in `src/data/animation/tours/grandTour/`; `grandTour.ts` is the storyboard (beat order, captions, dwell lengths) and imports each beat's choreography.
- `startTour(id)` → `guidedTourSaga`: auto snapshot/restore of settings + focus. HUD-hide derived from `tour.active`.
- Focus ids: structures `${category}-${seedId}` (e.g. `cluster-virgo-m87`, `void-bootes-void`, `group-local-group`); famous bare (`m31`, `m87`); Milky Way `milkyWay` (resolves with no data).

## Log

- **The tour owns its pole** (`openingTitle`/`approachM31`/`homeAgain` `frameTo`
  cues): screen-up is the orientation frame's pole, so a yaw drift — and
  `dwellDrift` is a yaw spin, the dwell in nearly every beat — rolls the image
  by `sin(|pitch|)` per radian of drift: a horizontal pan at the frame's
  equator, a pure roll near its pole. The default frame (`ecliptic`) puts most
  of the tour's subjects at 30–60° latitude, so most of every dwell's motion
  read as roll instead of orbit. The ladder galactic (opening, holds through
  you-are-here) → supergalactic (M31 approach outward — the tour is a tour of
  the local supercluster, which defines that plane) → galactic (home again)
  holds every subject much closer to its frame's equator; full per-subject
  latitude/roll-fraction table in the frame-invariant-camera-poses spec/plan
  (`docs/superpowers/specs/completed/2026-08-01-frame-invariant-camera-poses.md`).
  `frameTo` goes IN the clip, never on the beat, and fires as early as
  possible in each beat that changes frame — the roll itself is invisible
  during the opening's cold-open (sprite sub-pixel) and, for the other two,
  settles well before the beat's own end so it never fights the tour-end
  restore's own `requestOrientationChange` back to the viewer's pre-tour frame
  (`restoreSceneSaga`, unconditional). Roll duration is a per-clip constant
  (`FRAME_ROLL_SEC`, 3× the interactive switch's `FRAME_TWEEN_MS` feel) — an
  untuned starting point, not a derived value.
- **Inserting a beat mid-tour is a renumber, plus a bearing-chain re-check**
  (beat 03, `localGroup`): stage docs and debugger labels are ordinal, so an
  insertion renames every later `stages/NN-*.md` (+ `.facts.md`, their
  `stage:`/header numbers, the `script.md` table) and bumps the
  `grandTourBeats` labels — clip IDS stay name-based and never change. The
  camera side: computed dwell landings chain across beats (a dwell's arrival
  yaw = the previous dwell's exit when everything between writes only
  target/distance), so the new beat inherits the M31 dwell's bearing and
  re-sizes its own drift to the flythrough's launch. A net-yaw sliver (here
  +6°) can't carry a dwell — wrap it a full ±2π so the orbit IS the motion,
  choosing the sign that keeps the neighbouring dwells' spin direction.
- **Demand-loaded layers need a fade guard, or authored reveals pop** (beat
  05's volume/filament pop-in): a `show(..., over: 9)` on a layer whose asset
  hasn't downloaded yet starts the 9 s fade over an EMPTY renderer, and the
  slot commit's default-duration re-sync then stomps the ramp when the data
  lands — the layer pops. The cure is the flow row's existing pattern,
  a `guard` in `fadeLayers.ts` that suppresses the fade until the renderer
  holds the asset (`hasCloud()` / `listIds().includes(id)` /
  `fieldLoaded()`): loaded → the authored fade runs exactly as written;
  still downloading → nothing fades until arrival, then the commit fades it
  in from zero over the 600 ms default. Consequence for authors: a slow
  cinematic reveal is only honoured when the asset is already resident —
  the first cold run gets a clean 600 ms dissolve at arrival instead.
  All four demand-loaded rows are guarded: survey (`hasCatalog(id)`),
  filaments (`hasCloud()`), volumeField (`listIds()`), flow (`fieldLoaded()`).
- **The subject's ring category gates its focused label** (beat 06,
  `cosmicFlows`): under focusedOnly a focus() cue only names the subject if
  its structure category's rings are lit — `produceStructureLabels` skips
  labels whose ring category is disabled+faded. So pick the beat's subject
  from a category that's on at that scale (the flows beat focuses
  `supercluster-laniakea-sc`, whose rings survive from the web beat, rather
  than the Norma/Great-Attractor `cluster`, hidden since the Virgo→web step)
  — or budget a ring re-show into the beat's scene strip.
- **The scene at beat K is a pure function of K** (`computeSceneEntering`): before every beat entry, `guidedTourSaga` merges the tour baseline folded through every `show`/`hide`/`scene` cue of beats 0..K-1 (real settings reducer + the same `VISIBILITY_ACTION_ROW`/`scopedVisibilityActions` tables playback uses). Natural entries are dedup no-ops; a mid-fly skip (cues never fired) or a Prev (later cues must unwind) gets corrected automatically. Consequence for authors: you do NOT need to re-hide a later beat's layers "in case the viewer steps back" — reconstruction owns that. Focus stays beat-local: each enter clip establishes its own subject. Related: enter clips are skippable (the fly races `advanceTour`/`prevBeat`; a nav win cancels the clip and steers at once), and `guidedTourSaga` clears any pre-tour selection at start (beats only write the `focus` slot; a clicked halo would float through the run).
- **`show`/`hide` `over` is SECONDS and the fade bridge speaks ms** — `applySceneEffect` owns the conversion (was forwarded raw: a 9s volume reveal ran as a 9 ms pop).
- **Scale steps swap their scene, not just their camera** (beat 04, `approachVirgo`): each ring category belongs to the scale that introduced it, so the cluster beat hides `'structureRing:group'` as it shows `'structureRing:cluster'`; focusedOnly flips back ON (one subject again — the mode is beat-scoped, set it in EVERY beat that cares, don't inherit); and the beat's subject-matter data reveals at the scale that needs it — `'survey:2mrs'` (the first real survey reveal) rides the LOCAL-GROUP beat's opening, populating the family shot, the group sweep after it, and leaving Virgo already a swarm when the view turns to it. The famous galaxies alone are too sparse to sell either. No strafe on this aim: the stacked old anchor (Sculptor) is faint points, not a bright sprite.
- **focusedOnly-off is flood-safe per ring category** — structure labels ride their ring category's ANCHOR gate (`produceStructureLabels` skips a label whose ring category is disabled+faded), and the opening strip hid the whole `structureRing` family. So a beat can flip `setLabelsFocusedOnly(false)` and reveal just `'structureRing:group'` to get exactly the group labels + the already-revealed famous labels — no cluster/supercluster/void labels leak in (see `neighbourhoodFlythrough`). Pass-through flyPath waypoints take `linger: 0` (a [0,1] dwell DEPTH) so they shape the curve at cruise speed; only the settle knot keeps the default slow-down.
- **`strafeId` + push-in dwell** — two de-collinearity moves. (1) At the exact `lookAtId` bearing the orbit target stacks dead on the line to the subject (camera exactly behind it); compose a concurrent `strafeId(id, byDeg, over)` into the same `all` — it writes `target` while the aim writes yaw/pitch, so the single-writer rule holds. `byDeg` is angular (displacement = `tan(byDeg) × live camera distance`), positive strafes the rig right so the old anchor drifts ~`byDeg`° screen-left (`approachM31` uses `all([lookAtId(M31, 3), strafeId(M31, 10, 3)])`). A relative `spin('yaw')` is NOT the tool here — it base-writes yaw and clashes with the aim. (2) A beat that holds the previous beat's framing reads as a caption swap; compose a push-in INTO the dwell — `all([...dwellDrift(sec).timeline, dollyTo(closer, over)])` (see `youAreHereDwell`) — the dolly rides parallel with the drift's yaw/pitch, caption timing untouched. `dwellDrift` tuning knobs are now a named-options object (`{ rampSec, cruiseRate }`) after two beats fed a cruise rate into the positional ramp slot.
- **focusedOnly label mode** — `scene(setLabelsFocusedOnly(true))` in the opening strip: only the FOCUSED subject's label draws (all three producers gate on it; it multiplies on top of the per-layer `labelEnabled` toggles, so a hidden layer stays hidden). Each beat's `focus()` cue is then its own label reveal — no `label:*` juggling per beat. To name the subject BEFORE the fly, decompose `focusOnId`: `all([lookAtId, strafeId]) → focus → hold → all([moveTargetId, dollyToId])` (see `approachM31`). Flip the mode off with another `scene()` cue for a beat that wants many labels (the groups flythrough). Snapshot/restore covers it (7th cluster in `SettingsSnapshot`). Labels pop (no fade) on focus change — confirmed jarring in beat 02; refinement task in [`../backlog/2026-07-02-focused-label-fade.md`](../backlog/2026-07-02-focused-label-fade.md).
- **`lookAtId(id, over)` — turn before you fly.** The orbit camera always faces its target, so `moveTargetId` is a pure tracking shot (the eye translates with the target — it never rotates the view). "Looking at" a subject = orbiting the eye around the CURRENT target until the subject lines up centre-frame beyond it. `lookAtId` resolves to `aimAt(orbitAnglesLookingAlong(subject − live orbit target))`; the bearing is baked at resolve time, so it's only correct as an opening move — establish, then `focusOnId`. `resolveClipFoci` takes the live camera pose as its 4th arg (from `cameraRuntime.from`) — `lookAtId` bears from its target, `strafeId` scales by its distance.
- **Scoped show/hide entries** — `'family:scope'` strings inline in the layer list: `'survey:milliquas'`, `'structureRing:group'`, `'label:milkyWay'` / `'label:survey'` / `'label:structure'` / `'label:<category>'`. One targeted settings action instead of the whole-row fan-out; fades ride the reactive bridge (custom `over` applies to atomic layers only). Replaced the awkward `scene(setGalaxyCatalogVisible(...))` escape hatch.
- **`dwellSec` dissolved into `dwellClip`.** Beats author their dwell as a clip (`dwellClip: dwellDrift(8)` — or any clip: a flyPath ring, a push-in). The dwell length = the resolved clip's compiled `durationSec`; `visitBeatSaga` computes it and carries it on `dwellStarted({ dwellSec })` so the countdown ring reads the slice, not the beat. Trade accepted: after pause/resume the clip replays from its start into the remaining window (the saga can't reshape an opaque clip), so post-resume motion is cut mid-ease at the timer.
- **Caption reveals on clip LAND, not clip start** (`visitBeatSaga` step 4 = `dwellStarted()` fires after `playClip` resolves). So any in-clip `hold`/move is dead time the viewer sits through _before_ the beat's title appears. For a held/title beat, make the clip instant and let the dwell carry the motion. The limit case: when the caption should ride the motion itself, omit the enterClip entirely and author the flight AS the dwellClip (the neighbourhood sweep) — the dwell, and with it the caption, starts at beat entry. Scene cues fold from dwell clips too (`computeSceneEntering`), so reveals can ride along. Trade: a mid-flight pause replays the dwell from its start into the remaining window.
- **The dwell already drifts** (`pausableDwellSaga` → `dwellDrift`): a gentle eased yaw-orbit + zero-mean pitch-bob for the whole dwell, auto-settling on the cut. Don't add in-clip "keep it alive" motion — it's redundant and delays the caption.
- **Tour-level setup was moot — deleted.** Settings actions in a setup list worked, but camera actions there were fenced (clip@95 outranks tween@60; `clipEnded` clears tweens; `suspendDuringClip` blocks new ones mid-clip), and it was a second authoring surface. The scene strip now rides beat 1's clip: `hide([...], 0)` sweep + `scene(setGalaxyCatalogVisible(...))` for per-item toggles. Same snapshot/restore covers it; stepping back to beat 1 re-establishes its scene.
- **In-clip `focus()` never moves the camera** (selection/isolation only — the fence above). The fused select-and-fly verb is `focusOnId(id, over)` = `seq([focus, all([moveTargetId, dollyToId])])`; `flyAndFocusOnClip` wraps it.
- **Scene strip contents** (grandTour beat 1): volumes + filaments + flow + structure rings/labels + famous labels + MW label hidden, milliquas off; beats `show()` each as its reveal. Defaults that matter: `mcpm` volume ON, all structure rings/labels ON, all catalogs ON, filaments/flow/cf4 OFF.
