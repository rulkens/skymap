# Feature ideation — from animation clips to a social universe

_2026-07-19. Captured from a long ideation session that started as "make more
animation clips with the new star/planet/earth rendering" (which shipped
`earthFlyout`, PR #450) and escalated deliberately through clip ideas →
engine features → increasingly ambitious concepts → a social architecture.
This is an idea-mine, not a plan: nothing here is committed work. When an
item gets picked up, it goes through the normal brainstorm → refactor-ground
→ spec cycle and its entry here gains a pointer._

The escalation arc is preserved because it is itself informative: **features
that show things → arguments that make you realize things → doses that do
something to you → life infrastructure → causation and ritual → a social
place.** Each idea keeps its "reality tether" — the one fact or existing
asset that makes it buildable rather than sci-fi.

---

## 1. Clip ideas (buildable today with the existing vocabulary)

The clip system (`flyPath`, `focus`, `dollyTo`, `spin`, `oscillate`,
`rate`-orbit, `lookAtId`/`strafeId`, pass-by waypoints, `SCALE_FADE_BANDS`
auto-crossfades) supports all of these now. Positions are J2000-static, so
anything needing orbital motion waits on the ephemeris clock (§3.1).

### Planet-scale hero shots

- **Saturn's rings** — banked `rate`-orbit around Saturn with a slight pitch
  `oscillate`; ring shadow, axial tilt, glints. Best pure showcase of the
  planet renderer. Variant: **ring-plane crossing** — approach edge-on, rings
  compress to a razor line, cross, bloom open (the Cassini shot).
- **Jupiter + Galilean moons** — orbit Jupiter, then a short `flyPath` Io →
  Europa → Ganymede → Callisto. Sun-relative lighting gives real phases.
- **Planet parade / orrery** — one `flyPath` down the ecliptic, Mercury →
  Neptune; the pass-by machinery swoops beside each planet automatically.
- **Earthrise** — pull back from Earth until the Moon slides into frame.
- **Eclipse** — slide the camera onto the Sun–Moon axis behind the Moon so
  the Moon occults the Sun. Pose derivable from the two seed positions at
  module load, no hand-tuned literals. (Becomes a _real event_ with the
  ephemeris clock — see §3.1.)

### Star-scale

- **Star hop** — `flyPath` through the nearest famous suns (Sirius, Alpha
  Cen, Vega, Betelgeuse…); the `starCaption` fade band handles name reveals.
- **Sun departure** — start at the Sun, dolly back through the local
  starfield to the Milky Way disc; the star-scale sibling of `earthFlyout`.
- **Galactic sunrise** — start buried in the disc plane, rise perpendicular;
  the impostor's spiral spreads beneath like breaking cloud cover. One
  `moveTarget` + pitch tween; best effort-to-beauty ratio in this section.

### Descents and bookends

- **The plunge home** — exact inverse of `earthFlyout`: horizon → Earth's
  surface. The "all the way down" the Grand Tour's `homeAgain` stops short of.
- **Pale Blue Dot** — pull back only to Saturn's orbit, then
  `lookAtId('body-earth')` to catch Earth as a single dim pixel. The Voyager
  shot; strongest narrative punch per line of code.
- **Powers of Ten, properly** — the Eames homage: `seq` of dolly-then-`hold`
  pairs pausing at each 10× step. Same journey as `earthFlyout`, completely
  different rhythm.
- **The Loop** — `earthFlyout` authored so its end pose fades into its start
  pose: a seamless infinite powers-of-ten loop for `record-tour` /
  exhibition use.

### Perception-play clips

- **The Constellation Lie** — open on Orion from Earth's vantage, then strafe
  sideways thousands of parsecs: the familiar shape shears apart as real
  seeded distances reveal themselves; glide back until it snaps together.
  A constellation is a coincidence of sightlines — only a true-3D star map
  can make that point. Generalizes to §4.1 (the Great Unfolding).
- **Light Is Slow** — depart Earth at actual light speed; the Moon takes 1.3
  real seconds; captions carry the "8 minutes to the Sun, 4 years to Alpha
  Cen" arc while the clip exponentially cheats faster. Pacing IS the content.
  Wants captions → mini-tour form.
- **The View from Andromeda** — fly to M31, `lookAtId` home, dwell: the
  Milky Way as a smudge in _their_ sky, 2.5 million years stale.
- **A Sky with No Stars** — fly to the centre of a void (focusable
  structure), kill the dolly, spin slowly in place. The loneliest vantage
  point in the map.
- **Voyager's Road** — retrace the Grand Tour trajectory Earth → Jupiter →
  Saturn → Titan → heliopause, decades compressed to seconds.

### Multi-beat tour forms

- **"Home" mini-tour** — Earth → Moon → Sun → planets → nearest stars, with
  captions; its own splash entry (like `webShowcase`).
- **Grand Tour inner prologue** — prepend the descent so "The Long Way Out"
  truly starts on the ground and completes the powers-of-ten arc. Higher
  integration risk: touches the tour's snapshot/restore assumptions (see the
  powers-of-ten audit's capture/restore item).

_Constraint honestly noted: Earth night-side city lights, cloud shell, and
atmospheric limb belong to the in-flight Photoreal Earth effort — a
day/night-terminator clip would look flat until that ships._

---

## 2. Verdict from the session: shipped + ranked

- **Shipped**: `earthFlyout` ("Earth to the Edge") — baked start pose derived
  from `SCENE_EARTH`, log-dolly to 29,500 Mpc, zero show/hide (the
  `SCALE_FADE_BANDS` table auto-reveals every layer). PR #450.
- Ranked picks from the clip batches: **Constellation Lie** (most original,
  most "only this app can do this"), **Galactic Sunrise** (best
  effort-to-beauty), **Eclipse** (crowd-pleaser), **Saturn orbit** (best pure
  renderer showcase), **Pale Blue Dot** (best narrative).

---

## 3. Engine features that multiply tours/clips

### 3.1 The ephemeris clock — time as an animatable channel ★ the keystone

One `clock` value (Julian date) that position-producing systems read, making
"when" as animatable as "where". The single most transformative feature
because it upgrades every clip at once.

**Why skymap is unusually positioned**: the solar system is already computed,
not hand-placed — `scenePlanets`/`sceneEarth` derive positions from
`ORBITAL_ELEMENTS` via `keplerianPositionMpc(...)` evaluated at a frozen
J2000 epoch, and `rotationElements` follows the IAU convention where spin is
a function of days-since-J2000, also frozen. The clock doesn't add new math;
it un-freezes math already in the repo. Orbit conics stay valid for free
(the bead moves along the wire; the wire doesn't change).

**Authoring surface**: `clock` slots in as one more channel — closed-form
evaluation gives free scrubbing/pausing, `record-tour` works unchanged.
Helpers: `timeLapse(toDate, { over })` (a `tween('clock', …)`) and
`timeRate(unitsPerSec)` (a `rate('clock', …)`).

**Three tiers, one clock** (matching the spatial scale ladder):

1. **Solar system (hours→years)** — planets orbit, moons circle, planets
   rotate. ~22 Kepler solves per clock change, trivial. Unlocks: the _real_
   2026-08-12 total solar eclipse (you don't stage an eclipse, you go to
   one); Jupiter's 4:2:1 Laplace-resonance clockwork at ~1 day/sec; a year
   of Earth's orbit in ten seconds. Self-contained feature — no pipeline
   changes, no format bumps. **Spec-worthy on its own.**
2. **Stellar (kyr→Myr)** — bake Gaia `pm_ra/pm_dec` into the star bin
   (`build-stars-rs` change, format bump); vertex shader offsets by
   `pm · Δt` (a uniform + two multiply-adds). Watch the Big Dipper dissolve
   over 200 kyr. Composes with the Constellation Lie.
3. **Cosmological (Gyr)** — advect galaxy positions by sampling the loaded
   CF4 flow-field texture in the point vertex shader: `pos + v(pos) · Δt`.
   Laniakea visibly drains toward the Great Attractor. (Caveat: linear
   advection of a present-day field is a visualization, not an N-body sim —
   needs the didactic framing.)

**The two real design problems** (refactor-ground material):

- _Positions stop being data._ `SCENE_BODIES` bakes `positionMpc` into seed
  rows; ~16 consumers read it as a constant. The un-braiding: seeds keep
  identity (id, label, radiusKm, elements); a per-frame derived `bodyStates`
  map (id → position, orientation) becomes the one home of kinematic state.
- _The camera must ride a moving target._ Orbiting a body while the clock
  plays means the target must track `bodyStates[id]` per frame — exactly the
  shape the in-flight camera-intent-slice work (pose derived per frame via
  driver table) provides. The two efforts want each other.

Plus small parts: a clock line in the render-wake predicate, and a
**TimeBar** — a temporal twin of the ScaleBar (hours → years → kyr → Gyr
readout ladder) so viewers keep their anchor while time accelerates.

**Sleeper shot**: couple `clock` to `distance` in one clip — time zoom
locked to space zoom. Pull back from Earth while hours become centuries
become gigayears. Powers of ten in space _and time_ simultaneously.

### 3.2 Volumetric fly-through galaxies

Promote the `tools/galaxy-renderer` procedural Hubble-sequence galaxy (+ HDR
bloom pipeline) into the app: when the camera closes on Andromeda or the
Sombrero, crossfade the sprite/thumbnail into a volumetric object — dust
lanes parting around the camera. The scale-fade-band machinery is the proven
pattern for the popless handoff.

### 3.3 The CMB as the literal wall

Put the Planck CMB map on the horizon shell — faint, redshifted, physically
honest as the thing you _would_ see. The `theEdge` beat's finale becomes the
mottled afterglow of the Big Bang closing around the entire map. One
textured sphere.

### 3.4 Relativistic flight

Aberration + Doppler as a screen-space/vertex transform driven by apparent
camera velocity: forward starfield blueshifts and crowds toward the
boresight, the sky behind reddens and dims. Every fast dolly becomes a
warp-drive shot for free. Pairs with the Light Is Slow clip.

### 3.5 Surface mode — stand on the ground and look up

Camera pinned to Earth's surface, horizon locked, looking up: the map as
_your sky_. A tour ends by landing; the constellations assemble from stars
you just flew between; Andromeda — that smudge — is where you were forty
seconds ago. Reconnects the dataset to lived experience. Composes with the
clock (time-lapse the sky wheeling).

### 3.6 Honorable mentions

- **Black-hole flyby lensing** — extend the cluster-lensing machinery
  (PR #365) to an M87\* close pass with background shear.
- **Supernovae in passed galaxies** — one-frame transients at realistic
  rates so long dwells feel alive. Tiny feature, big subliminal payoff.
- **"You are here" inset minimap during tours** — fixes the anchor-loss
  problem every powers-of-ten film has.

---

## 4. Ambitious never-seen features ("arguments")

Each makes the viewer _feel_ a fact that is otherwise just a sentence.

### 4.1 The Great Unfolding — the sky is a projection, watch it break

A morph channel `unfold: 0 → 1` interpolating every point's radial distance
between "fixed celestial sphere" (the night sky every human believed) and
"true distance" — one uniform, in the vertex shader. Play it slowly: the sky
unfolds, constellations shear apart, the SDSS wedge extrudes into its
million-galaxy cone. Backwards: the universe collapses into a planetarium
dome. Cheapest item of its tier; candidate signature shot for the whole app.

### 4.2 Rewind to the Big Bang — and it happens _here_

Multiply positions by scale factor `a(t)` (one uniform). Animate `a → 0.001`
and the cosmic web rushes inward _converging on the camera — wherever it
is_. The CMB shell blueshifts and closes in like a furnace wall. Park at
Earth: it happens at Earth. Park in the Boötes void: happens there too.
That's the lesson — the Big Bang happened everywhere — and only an
interactive map can teach it, because the viewer chooses the center and
discovers every choice works. Cartoon-of-structure-formation caveat needs
the didactic framing.

### 4.3 Anywhere's Sky — the view from a random galaxy

The observer is just a parameter: stand at any of the 2.5M galaxies and see
the entire sky recomputed for real. Sky surveys can't do this (RA/Dec baked
into their pipelines); skymap already paid the 3D-conversion price —
relocation is a change of origin + per-galaxy apparent-magnitude recompute
in the shader. Tour version: fly to a galaxy and the sky reassembles for the
destination as you decelerate.

### 4.4 Stare Mode — a deep field in any dark patch

Exposure as a channel: hold the camera on a black patch and faint sources
bloom magnitude-band by magnitude-band, like a lengthening exposure — real
objects, real depths, the direction you chose. The Hubble Deep Field lesson
(every dark pixel is full), interactive. Mostly a magnitude-gate uniform +
HDR accumulation aesthetics.

### 4.5 The Worldline Weave — the universe as fabric

Integrate every galaxy's CF4 trajectory ±5 Gyr and render the _paths_
instead of the points: millions of threads bundling into attractor basins,
Laniakea as a literal drainage basin combing toward the Great Attractor.
Real GPU work (streamline integration; `flow-workbench` is halfway there).
Turns the least-visible dataset into the most beautiful layer.

---

## 5. Unhinged tier one ("doses" — the app does something to you)

- **The Horizon of Regret** — render the cosmic event horizon (~16 Gly;
  galaxies beyond can never receive a signal from you, ever) and the live
  counter: _"While you watched this, ~20,000 galaxies became permanently
  unreachable."_ True, computable, and hard to look at.
- **Ride the photon** — real special relativity: aberration crushes the 4π
  sky into a tunnel, the universe Lorentz-flattens, blueshift turns the CMB
  into a headlight; at c, proper time stops, so the 2.5-Myr trip from
  Andromeda renders as _one white frame_. "For the photon, there was no
  journey."
- **The light shells of history** — every event has a wavefront: the Moon
  landing announcement is a 57-ly sphere washing over named, real stars
  tonight; Tycho's 1572 supernova shell is 450 ly out. Personal version:
  your birthdate sphere — stars inside it exist in a universe where you've
  been born. Fly along your own leading edge. The star bin makes it real.
- **The map is LIVE** — pipe transient alert streams (ZTF/LSST brokers, GRB
  networks, GW localizations; public APIs) into the 3D map: a supernova
  blooms 800 Mly away, "detected 22 minutes ago". The only 3D seismograph of
  the universe; leave it on a wall and explosions accumulate like rain.
- **Epistemic mode — the map confesses** — dissolve every galaxy into its
  actual radial uncertainty cigar; all the cigars (and the Fingers of God)
  point at Earth. You can locate the astronomer by the shape of their
  ignorance. The most honest mode ever shipped in a data viewer.
- **Andromeda is coming — from your porch** — surface mode + clock at
  Myr/sec: M31 swells to fill the sky over 4 Gyr. Fixed viewpoint = cheap;
  the drama is entirely clock + impostor scaling.
- **The sound of the Big Bang** — the BAO ripple (~500 Mly preferred galaxy
  separation) is a frozen sound wave present in skymap's own catalog; run
  the correlation function live, shift ~50 octaves, and let users hear
  their own dataset ring. Playing the fossil, not sonification-as-décor.
- **Olbers' switch** — toggle off expansion + finite age and do the integral
  honestly: the night sky ignites to solid starlight; flip age back on and
  darkness pours in. A 300-year-old paradox solved in the visual cortex in
  ten seconds.
- **Heat Death screensaver** — run the clock to 10¹⁴ yr: blue stars die
  first, the map reddens, dwarfs gutter out (real stellar-lifetime physics
  off the temperatures in the star bin), horizon galaxies redshift away.
  Then black — and the app _stays black_ until you reset the clock yourself.
- **Copernican Roulette** — "Reroll your existence": teleport to a vantage
  drawn at random weighted by real stellar statistics. You basically never
  land somewhere like here. The Copernican principle as a gambling addiction.
- **Everything here is dying** — hospice overlay: per-star remaining
  lifetime (derivable from mass/temperature in the bin), Betelgeuse "any
  century now", the Sun "half spent"; galaxies recolored by star-formation
  rate as still-being-born vs already dead.
- **The brain/universe morph** — the MCPM web was literally grown by a
  Physarum algorithm; load an actual connectome volume as a second SCFD and
  crossfade brain ↔ cosmic web in the same raymarcher. The statistical
  resemblance is published science. No caption.
- **One pixel** — pull back past the horizon into honest rendered nothing
  until the observable universe is a glowing speck: "Everything ever
  observed, by anyone, is inside this pixel." No reveal past it — the
  refusal to render further is the statement.

---

## 6. Unhinged tier two ("life infrastructure")

- **The Cage Flight** — a real-time light-speed flight to Proxima: 4 years
  3 months of actual wall-clock time, persisted across sessions, milestone
  notifications (heliopause at four months), arrival as a calendar event.
  Precedent: John Cage's ASLSP (ends 2640). Engineering: a persisted clock +
  notification scheduler.
- **First Witness** ★ — SDSS/GLADE were pipeline-processed: for most of the
  2.5M objects **no human has ever consciously looked at that specific
  galaxy**. Global first-look registry: focus a galaxy, and if unclaimed —
  "You are the first conscious being to regard this galaxy. Logged."
  Species-level completion meter on the splash ("humanity has beheld 0.3%
  of this catalog"). Guaranteed, verifiable first-contact for every user;
  the catalog's enormity IS the mechanic.
- **Memorial shells** — a registered life's causal wavefront keeps expanding
  at c after death; annual notification: "This year, the wavefront of your
  mother's life reached three new star systems" (named, from the bin).
  Grief tech from special relativity. Near-zero code; heavy enough to
  warrant a real should-we conversation.
- **The Mayfly Slider** — knowable-universe radius = lifespan × c: a mayfly's
  universe ends inside the solar system; a sequoia's passes every star you
  can name. Then "with writing": the sphere explodes 5,000 years backward —
  records are inherited light cones; that's what libraries physically are.
- **The Loneliest MMO** — multiplayer where messages travel at c through the
  map's geometry: Earth ↔ Andromeda chat has a 2.5-Myr delivery time,
  enforced straight-faced. Conversation requires flying within each other's
  light cones. The one playable zone — both users in the solar system —
  recreates Mars-mission latency in a chat box.
- **The PERSPECTIVE button** — the app reduced to an OS menu-bar button: hit
  it and the screen flies from your GPS position to the CMB in twenty
  seconds, ends on the one-pixel shot, returns you to your inbox. The
  overview effect as a system utility. (Payload = `earthFlyout` + tray icon.)
- **The confession at the edge** — a text box at the horizon shell: rendered
  once as a faint outbound wavefront, then cryptographically destroyed. Not
  stored, not readable, ever. Every human deletion ceremony (burned letters,
  bottles) with the best staging that will ever exist.

---

## 7. Unhinged tier three ("causation, ritual, institution")

- **The Commissioning Engine** — robotic telescopes sell time via API today.
  Aggregate user attention on under-observed patches triggers a real
  observation; results flow back into the bins. "You looked at a blank patch;
  three weeks later a telescope in Chile looked too, because you did." The
  map becomes an organ of active perception steered by its users' gaze.
- **The Photon Receipt** — amateur equipment can attributably capture
  photons from M31. Pair a cheap sensor: when a photon that left Andromeda
  2.5 Myr ago terminates its existence in your device, the app issues a
  timestamped certificate of absorption. "The terminus of this photon's
  entire journey was: you."
- **The Andromeda Relay** — the light-speed flight to M31: 2.5 million
  years, ~80,000 generations of willed custodianship, with the lineage tree
  rendered like a cathedral's building-generations and an honest decaying
  probability-of-completion readout (oldest human institutions: ~1,500 yr).
  A monument to futile custodianship, with a progress bar.
- **The Estate Plan** — a dead-man's switch: no human interaction for 100
  years → the app broadcasts itself outward (catalog, witness registry,
  memorial shells) and/or the physical build: the catalog on nickel discs
  (Long Now Rosetta-disc tech, already flown) — the map formatted for
  archaeologists. The designated last witness.
- **The Supernova Oath** — bind a real decision to the next real transient
  detection: unforgeable, unpredictable, indifferent randomness; you chose
  the what, a star that died 40 Myr ago chooses the when. "SN 2027fx
  detected. Your oath is due."
- **The Graduation** — perceptual training until the user demonstrably sees
  depth in the real night sky, then a final descent to their GPS
  coordinates, "The sky is the app now. Go outside." — and the app locks
  itself forever. One-time-use cosmology; success metric = uninstallation.
- **Versioning by the sky** — major releases pegged to actual cosmic change:
  v2.0 ships when Betelgeuse goes supernova (the event beat pre-authored,
  waiting, dark). Roadmap: "v3.0 — Andromeda merger, ~4.5 Gyr. Backlog
  frozen pending upstream."

---

## 8. Social architecture — making skymap a place

The core insight: skymap has what social apps fake — **genuine place-ness**.
Real coordinates, real scarcity (every galaxy unique), real remoteness
(being somewhere obscure means something), one shared reference frame.
Social = making other humans visible in the territory, not bolting on a
feed. Relevant precedents: Journey (wordless strangers in vast space),
Death Stranding (asynchronous traces), geocaching (first-to-find culture),
Galaxy Zoo (100k volunteers classified a million galaxies — people will
inhabit this data).

**Five loops:**

1. **Traces** — guestbook notes pinned to galaxies (finding a stranger's
   note on a nothing-galaxy 400 Mly out = a cairn on a remote ridge; most
   objects unmarked forever is what makes a marked one sacred). **Desire
   paths**: aggregate flight trails as a faint luminous layer — worn routes
   glow, the unflown dark is an invitation; solves social cold-start because
   traces accumulate even with ten users. Attention heatmap layer (also the
   Commissioning Engine's input).
2. **Collection** — the First Witness registry as the _identity spine_:
   profile = witnessed galaxies + named discoveries + notes + FTFs.
   Community naming of unnamed catalog ids → namable shared landmarks.
3. **Presence** — live visitors as faint drifting sparks at their camera
   positions. The universe's size is the moderation system: encounters are
   rare, therefore meaningful (Journey's engine, inherited free from scale).
   Proximity-gated presence only; no global chat (a lobby would flatten the
   place).
4. **Events** — the transient feed turns news into gatherings (watch the
   sparks flock to a supernova). **Synced tour screenings**: `ClipData` is
   serializable JSON, so a hosted tour = broadcasting clip playback to N
   synced cameras — planetarium shows anyone can host (2026-08-12 eclipse =
   opening night, given the clock). Personal rituals: "your witnessed galaxy
   transits your meridian tonight."
5. **Creation** — the UGC loop is nearly built: a tour editor is a friendly
   skin over `ClipData`; share button + gallery + featured picks;
   `record-tour` exports for outside-world distribution. Dedications: a
   crafted flythrough ending at a galaxy with a note — the non-scam "buy a
   star" (you gift the journey, not the object).

**Architecture**: all small data (notes, registries, trails, presence
positions, JSON clips). The existing Cloudflare stack covers it — KV/D1 for
registries/guestbooks, Durable Objects for presence rooms + synced
screenings, R2 (already deployed) for clip/tour blobs. The real cost is
moderation (public text: rate limits, reports, review queue) and accounts —
that's the actual project, more than rendering.

**Sequencing** (each step valuable alone, each feeding the next):

1. **Shared clips** — permalink to a user-authored flythrough (`#focus=`
   URLs half-exist). The atom of sharing.
2. **First Witness registry** — identity + the guaranteed first-visit magic.
3. **Guestbooks + desire paths** — asynchronous life before live population.
4. **Presence sparks** — live life.
5. **Synced screenings + transient events** — appointment viewing; weather.

This is a strategic fork (renderer → service with users/accounts/content)
and warrants the full brainstorm → refactor-ground → spec cycle, starting on
slice 1+2: smallest backend, biggest magic, everything later stacks on its
auth + storage foundation.

---

## 9. Cross-cutting observations

- **The keystone dependency graph**: the ephemeris clock (§3.1) multiplies
  more items than anything else — the eclipse clip, Andromeda-from-your-
  porch, heat death, the Cage Flight, versioning-by-the-sky, and the
  space+time coupled zoom all ride it. Tier 1 (solar system) is
  self-contained and spec-ready.
- **Cheap-but-profound cluster**: the Great Unfolding, One Pixel, Olbers'
  switch, PERSPECTIVE button, and Rewind-to-the-Big-Bang are all
  approximately "one uniform + restraint". The engineering in the later
  tiers is mostly counters, clocks, notifications, and blackness bolted onto
  rendering that already exists.
- **Real-data moat**: every idea that lands hardest does so because the data
  is genuinely 3D and genuinely real — the sky is a projection (§4.1), the
  Big Bang is everywhere (§4.2), Earth isn't special (§4.3), emptiness is an
  exposure artifact (§4.4), the web moves (§4.5). Mockups can't make these
  arguments; catalogs can.
- **Should-we flags**: memorial shells and the confession booth carry real
  emotional weight and deserve an explicit ethics/design conversation, not
  just a spec. The live-feed and social features carry moderation duty.
