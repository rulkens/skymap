# UX Content Spec — The Words on Screen

This document specifies **every string of text** the user encounters during the cosmic zoom: primary overlays, secondary "more info" content (v2), button labels, error and loading messages, credit lines, alt text. The accompanying `01-information-overlays.md` covers *where* and *how* the text appears (typography, motion, layering); this document covers *what it says*.

Primary overlay copy is restated from `vision/01-narrative-script.md` — that document is the source of truth for shell ordering and primary beats. This spec extends it with everything else, and pressure-tests the v2 "more info" content by drafting it in full now, before we discover it's harder than it looks.

The bar is high. Per Principle 5 in the product vision: *honest about what we don't know*. Per Principle 2: *zero text below the fold* — the user is watching a movie, not reading a textbook. Every primary overlay is at most three sentences and must read aloud in under eight seconds.

---

## 1. Voice & tone guide

### Voice — the persistent personality

The cosmic zoom speaks in the voice of an **observatory readout meets science journalism**: precise enough to satisfy a physics graduate, warm enough to hold a curious teenager. Think *NASA's "Astronomy Picture of the Day" caption* crossed with a *Cosmos: A Personal Voyage* voiceover, minus the saxophone.

Three pillars define the voice:

- **First-person plural.** "We," "our," "us." Never "you" except in instructional UI. The tour is a shared experience between the user and the project — we are travelling together. "Our Solar System" carries an implicit warmth that "the Solar System" does not. This also subtly reinforces that the perspective is *anthropocentric by design*: we are observers from this one rock, looking out.
- **Present tense.** "Galaxies cluster into a thin pancake," not "Galaxies have clustered." The universe in the tour is now. Past tense reads as historical retelling; present tense reads as live observation. Exception: the CMB beat ("Light from 13.8 billion years ago") earns past-relative phrasing because the temporal claim is the point.
- **Concrete numbers, then context.** Always pair a measurement with a relatable anchor in the same sentence. "100 billion stars" alone is noise; "100 billion stars; our Sun orbits the center every 230 million years" turns the number into a clock the reader can feel.

### Tone — modulates with the shell

The tone shifts subtly across the three acts:

- **Act I (Shells 1-4: Sun → Local Group)** — *familiar and grounding.* The reader knows these things. We are reminding, contextualising. Tone is gentle, almost conversational. "Eight planets around one star."
- **Act II (Shells 5-8: Local Sheet → Cosmic Web)** — *expansive and slightly awed.* We are leaving the reader's intuition behind. Tone allows itself a moment of wonder. "100,000 galaxies all falling toward the same point."
- **Act III (Shell 9: CMB)** — *quietly final.* We have arrived at the edge of what can be observed. Tone is hushed, definite, with one acknowledged limit. "Beyond it, we cannot see."

### Forbidden moves

- **No exclamation marks.** Not one. The visuals do the exclaiming.
- **No "amazing," "incredible," "mind-blowing."** If we have to tell the reader they should be amazed, we have already failed.
- **No second-person imperatives in body copy.** "Look at the spiral arms" is patronising. The reader is already looking.
- **No jokes.** This is a classroom-safe product (Principle 3 audience: educators). Jokes don't translate, age, or scale.
- **No hedging weasels.** "Some scientists believe" is a tell that the writer doesn't know. State the consensus or admit uncertainty cleanly: "We're not entirely sure why."
- **No units without scale anchors.** "30 Mpc" is forbidden. "100 million light-years across — about the distance light travels in the time since dinosaurs went extinct" is the bar.

### Permitted uncertainty (Principle 5)

The tour is allowed — encouraged — to say *we don't know* when the science is genuinely open. Three places where this applies:

- The Local Sheet's flatness ("Why? We're not entirely sure.")
- Laniakea's outer boundary ("where it ends is still being mapped")
- What lies beyond the observable universe ("The universe is bigger; we just can't reach it.")

Acknowledging ignorance is a feature, not a hedge. It tells the reader we are not fudging.

---

## 2. Primary overlay copy — the nine shells

These are the strings that appear on screen during the tour. Each has been pressure-tested against the Principle 2 limits: ≤3 sentences, ≤20 words/sentence, ≤8 seconds read-aloud. Where the narrative script already specified the copy, it is restated verbatim; where the narrative script left room, an alternate is provided in italic comment beneath, with rationale.

### Pre-roll — `T+0:00`

- **i18n key:** `tour.preroll.title` / `tour.preroll.controls`
- **Copy:**
  > **TOUR BEGINS · 90 SECONDS**
  > *Press `space` to pause · `esc` to exit*

### Sun beat — `T+0:05`

- **i18n key:** `tour.shell0.sun.title` / `tour.shell0.sun.body`
- **Copy:**
  > **THE SUN**
  > 1.4 million km across · 8 light-minutes from Earth · about 4.6 billion years old.

- **Alternate considered:** "Our nearest star. 1.4 million km across, 4.6 billion years old, with another 5 billion to go." Rejected: the "another 5 billion to go" beat opens a tangent about stellar evolution we don't have time for.

### Shell 1 — Solar System

- **i18n key:** `tour.shell1.solar.title` / `tour.shell1.solar.body`
- **Copy:**
  > **OUR SOLAR SYSTEM**
  > Eight planets around one star. The nearest other star is 4 light-years away — 1,800 times further than Pluto.

- **Alternate considered:** "Eight planets, one star, and a vast amount of empty space." Rejected for vagueness; the Pluto-anchor is what makes the scale legible.

### Shell 2 — Stellar Neighborhood

- **i18n key:** `tour.shell2.stars.title` / `tour.shell2.stars.body`
- **Copy:**
  > **OUR STELLAR NEIGHBORHOOD**
  > About 7,500 stars within 50 light-years. The closest, Proxima Centauri, would take 73,000 years to reach with Voyager.

- **Optional second beat (T+0:21 if pacing allows):** "Each color is a temperature: blue stars are hotter than the Sun, red stars are cooler." (i18n: `tour.shell2.stars.color`)

### Shell 3 — Milky Way

- **i18n key:** `tour.shell3.milkyway.title` / `tour.shell3.milkyway.body`
- **Copy:**
  > **THE MILKY WAY**
  > A barred spiral galaxy. About 100 billion stars. Our Sun orbits the center every 230 million years.

- **Optional sub-beat (T+0:31):** "We are about halfway out, in the Orion Arm." (i18n: `tour.shell3.milkyway.location`)

### Shell 4 — Local Group

- **i18n key:** `tour.shell4.localgroup.title` / `tour.shell4.localgroup.body`
- **Copy:**
  > **THE LOCAL GROUP**
  > Two big spirals — us and Andromeda — and about 80 small companions. We'll collide with Andromeda in 4.5 billion years.

- **Alternate considered:** "Andromeda. Us. Triangulum. Eighty dwarfs. Bound by gravity, falling together." Rejected: too clipped, breaks the warmer Act-I tone. Saving the staccato voice for Act II reveals.

### Shell 5 — Local Sheet

- **i18n key:** `tour.shell5.sheet.title` / `tour.shell5.sheet.body`
- **Copy:**
  > **THE LOCAL SHEET**
  > Within 30 million light-years, galaxies cluster into a thin pancake. Why? We're not entirely sure.

- **Note:** Per the narrative script, the "we're not entirely sure" beat is intentional and load-bearing. Do not soften.

### Shell 6 — Virgo Supercluster

- **i18n key:** `tour.shell6.virgo.title` / `tour.shell6.virgo.body`
- **Copy:**
  > **THE VIRGO SUPERCLUSTER**
  > The Virgo cluster — that red glow is hot intracluster gas, 30 million degrees, holding the cluster together. We're falling toward it at 250 km/s.

- **Length check:** This is the longest overlay in the tour at 28 words. Read-aloud test: ~7.5 seconds. Within budget but tight. If trimming is needed, drop "holding the cluster together."

### Shell 7 — Laniakea

- **i18n key:** `tour.shell7.laniakea.title` / `tour.shell7.laniakea.body`
- **Copy:**
  > **LANIAKEA — OUR HOME SUPERCLUSTER**
  > 100,000 galaxies all falling toward the same point. Defined in 2014 by mapping where matter flows.

- **Alternate considered:** "Hawaiian for 'immeasurable heaven.' Defined in 2014." Rejected: the etymology is charming but the *flow lines* are the visual; copy should explain what the user is seeing, not name-drop linguistic trivia. (Etymology moves to "more info.")

### Shell 8 — Cosmic Web

- **i18n key:** `tour.shell8.web.title` / `tour.shell8.web.body`
- **Copy:**
  > **THE COSMIC WEB**
  > Galaxies aren't randomly placed. They lie on filaments billions of light-years long, surrounding empty voids.

### Shell 9 — Observable Universe

- **i18n key:** `tour.shell9.cmb.title` / `tour.shell9.cmb.body`
- **Copy:**
  > **THE OBSERVABLE UNIVERSE**
  > The Cosmic Microwave Background — light from 13.8 billion years ago. Beyond it, we cannot see. The universe is bigger; we just can't reach it.

- **Length check:** 27 words across three sentences. Reads aloud in ~7 seconds; the third sentence carries the emotional landing and should not be cut.

### Outro — `T+1:36`

- **i18n key:** `tour.outro.title` / `tour.outro.body`
- **Copy:**
  > **TOUR COMPLETE**
  > *Click "Replay" to watch again, or fly anywhere — drag to orbit, scroll to zoom.*

---

## 3. Secondary "more info" content — v2 dependency, drafted now

Drafted now to pressure-test depth. The v1 ship does not include the side panel; the panel work is tracked separately. But writing the prose now serves three purposes: (1) confirms there is something *worth* showing in v2, (2) catches scientific issues with the primary overlays before the v1 copy freezes, (3) gives the science reviewer something more substantial to react to than a 20-word headline.

Each block is **3-5 paragraphs, ~150-250 words**. Tone matches the voice guide. Each paragraph stands alone — readers will skim.

---

### Shell 1 — Solar System (more info)

**i18n key:** `tour.shell1.more`

The Solar System is, by mass, almost entirely the Sun. The Sun accounts for 99.86% of all the mass here; everything else — planets, moons, asteroids, comets, you, us, the Voyager spacecraft — fits into the remaining 0.14%. Of that fraction, Jupiter alone is more than two-thirds. The four rocky planets (Mercury, Venus, Earth, Mars) are a rounding error.

The orbits we draw are real — eccentricities and inclinations from JPL ephemeris data. Pluto's orbit is visibly tilted, about 17° off the ecliptic. Mercury's is the most eccentric of the planets; you can see it stretches noticeably toward and away from the Sun. We do *not* draw orbital motion in the tour: the universe is presented as a snapshot, not a clock.

The "edge" of the Solar System depends on what you mean. The planets stop at Neptune (4 light-hours out). The Kuiper Belt — Pluto's neighborhood — extends to about 7 light-hours. The heliopause, where the solar wind gives way to interstellar space, sits around 18 light-hours. The Oort Cloud, a hypothesised spherical reservoir of comets, may extend to a full light-year — a quarter of the way to Proxima Centauri.

Voyager 1, launched in 1977, crossed the heliopause in 2012. It is the most distant human object. At its current speed, it would take roughly 73,000 years to reach Proxima Centauri, if it were aimed there. It is not.

---

### Shell 2 — Stellar Neighborhood (more info)

**i18n key:** `tour.shell2.more`

The stars in this view are real — positions and colors from ESA's Gaia mission, currently the most precise stellar catalog ever made. Gaia has measured parallax distances for about 1.5 billion stars; we display the nearest ~7,500 here, all within 50 light-years of the Sun.

Color is not artistic licence. Each star's color comes from its Gaia BP-RP photometry, which directly tracks surface temperature. Hot O- and B-type stars glow blue-white at 10,000 K and above. Sun-like G-type stars are warm yellow at ~5,800 K. Cool M-type dwarfs — by far the most common kind of star — glow red at 3,000-4,000 K. The Sun is unremarkable; most stars in this volume are red dwarfs you would never see with the naked eye.

The bright named stars labelled in this shell are bright in our sky for two different reasons. Sirius (8.6 ly) is intrinsically bright *and* very close. Vega (25 ly) is intrinsically bright. Proxima Centauri (4.2 ly), the closest star, is so dim you cannot see it without a telescope despite being our neighbor.

Distances to nearby stars are good to ~1% via parallax. Beyond a few hundred light-years, parallax becomes unreliable, and we lean on harder methods (spectroscopic distances, standard candles, eventually redshift) for everything further out in the tour.

---

### Shell 3 — Milky Way (more info)

**i18n key:** `tour.shell3.more`

The Milky Way is a *barred spiral* — a disk of gas, dust, and stars rotating around a central bar-shaped concentration of older stars. The bar was confirmed only in the early 2000s, primarily through Spitzer Space Telescope infrared maps that could see through the dust. Before that, the Milky Way was assumed to be an ordinary spiral. Most spirals in the local universe, in fact, turn out to be barred.

The disk is roughly 100,000 light-years across and 1,000 light-years thick — a remarkably flat object, with an aspect ratio thinner than a CD. The Sun sits about 26,000 light-years from the center, in a minor spiral feature called the Orion Spur or Orion Arm, between the larger Sagittarius and Perseus arms. The Sun completes one orbit of the galactic center every 230 million years; in its 4.6-billion-year lifetime, it has lapped the galaxy about twenty times.

At the very center is Sagittarius A* — a supermassive black hole of about 4.3 million solar masses, confirmed by decades of stellar orbit tracking from the European Southern Observatory and by direct imaging from the Event Horizon Telescope in 2022. Most large galaxies have such a black hole at their center. The mass of the central black hole correlates closely with the mass of the host galaxy's bulge — a relationship we still do not fully explain.

The image we render of the Milky Way is necessarily a *model*. We cannot photograph our own galaxy from outside it. The best we can do is reconstruct its shape from infrared surveys (which see through dust), stellar surveys like Gaia, and analogy with other spirals.

---

### Shell 4 — Local Group (more info)

**i18n key:** `tour.shell4.more`

The Local Group is the gravitationally bound system of galaxies of which the Milky Way is a member. It contains two large spiral galaxies — the Milky Way and Andromeda (M31) — one mid-sized spiral (Triangulum, M33), and somewhere around 80 known dwarf galaxies. New dwarfs are discovered regularly; the count rises every few years as deeper surveys come online.

Andromeda is about 2.5 million light-years away and roughly 50% larger than the Milky Way by stellar mass. It is approaching us at 110 km/s — the only large galaxy that is *not* receding due to cosmic expansion, because we are gravitationally bound to it. In about 4.5 billion years the two galaxies will collide and merge over the course of several billion years, eventually forming a single elliptical galaxy informally nicknamed "Milkomeda."

The dwarf galaxies — Sagittarius dSph, Sculptor, Fornax, Leo I and II, Draco, the Magellanic Clouds, and dozens of fainter companions — are most of the Local Group by *count* but a tiny fraction by *mass*. Many of them are being slowly torn apart by the gravity of the larger spirals; the Sagittarius Dwarf is in the middle of being shredded into long stellar streams that wrap around the Milky Way.

The Local Group itself is not isolated. It sits at the edge of the Local Sheet (next shell), and the gravitational pull of the Virgo cluster is already detectable in our motion through space.

---

### Shell 5 — Local Sheet (more info)

**i18n key:** `tour.shell5.more`

The Local Sheet is a flattened distribution of nearby galaxy groups — including our Local Group, the M81 group, the Centaurus A/M83 complex, and several smaller assemblies — all confined to within about 7 million light-years of a single plane. The plane is roughly aligned with the supergalactic plane, a coordinate system astronomers defined in the 1950s to track exactly this kind of large-scale flatness.

Why nearby galaxy groups should lie in a sheet is an open question. The most common explanation is that we are seeing a "wall" of the cosmic web — a sheet-like overdensity at the boundary between the Local Void (a vast empty region above the sheet) and the dense Virgo Supercluster region below it. Cosmological simulations naturally produce these flat structures, but the specific geometry of *our* sheet, with so few galaxies above or below it, is unusually pronounced.

The motion of galaxies within the sheet is also peculiarly orderly. They move with relatively small random velocities relative to one another — the velocity field is "cold" — which is itself a clue about how the sheet formed and how the surrounding voids have evolved. The Local Void above us is expanding; the surrounding higher-density regions are pushing us along the sheet's plane.

The Local Sheet is one of the more recently named structures in extragalactic astronomy — it was characterised in detail by R. Brent Tully and colleagues in the 2000s. The naming convention follows a pattern: as our maps improve, structures we previously thought were a single thing reveal themselves to be parts of larger, more organised wholes.

---

### Shell 6 — Virgo Supercluster (more info)

**i18n key:** `tour.shell6.more`

The Virgo Supercluster — also called the Local Supercluster — is a region of enhanced galaxy density about 100 million light-years across, centered roughly on the Virgo cluster. The Local Group sits near its outer edge. Until 2014, this was considered our home supercluster; the Laniakea redefinition (next shell) reclassified it as a *lobe* of a larger structure.

At its heart is the Virgo cluster proper — a rich gravitationally bound cluster of about 1,300 galaxies, dominated by the giant elliptical M87. M87 is itself famous for hosting a 6.5-billion-solar-mass supermassive black hole, the first black hole ever directly imaged (Event Horizon Telescope, 2019). Virgo is about 54 million light-years from us, and we are falling toward it at roughly 250 km/s — a peculiar velocity superimposed on the general Hubble expansion.

The red glow shown around the Virgo cluster represents real X-ray data from ROSAT and other X-ray observatories. The intracluster medium — the hot gas filling the space between cluster galaxies — reaches temperatures of 30 million Kelvin and emits strongly in X-rays. This gas actually contains *more mass* than all the cluster's galaxies combined. Most of the matter in clusters is gas, not stars; and most of the matter is dark matter, dwarfing both.

The supercluster also contains the Fornax cluster, the Eridanus cluster, and several smaller groups, all connected by faint filaments of galaxies. It is not gravitationally bound as a whole — some of its outer parts will eventually fall into Virgo, others will drift away with cosmic expansion.

---

### Shell 7 — Laniakea (more info)

**i18n key:** `tour.shell7.more`

Laniakea — Hawaiian for "immeasurable heaven" — was defined in a 2014 paper by R. Brent Tully and colleagues. It is named in honor of the Polynesian navigators who used the night sky to cross the Pacific. The definition is novel: rather than drawing supercluster boundaries by where galaxies *are*, Laniakea is defined by where galaxies *flow*. Any galaxy whose peculiar velocity points inward toward a single gravitational basin — the Great Attractor region in the constellation Centaurus — is part of Laniakea.

The boundary is therefore a *velocity divide*, analogous to a watershed on Earth. On one side, water flows into one ocean; on the other, into another. On one side of the Laniakea boundary, galaxies drift toward the Great Attractor; on the other, they drift toward the Perseus-Pisces supercluster, or the Coma cluster, or some other distant attractor. The boundary itself is not visible — it has to be reconstructed from velocity measurements.

Laniakea contains an estimated 100,000 galaxies and spans roughly 500 million light-years. The Local Group, the Virgo Supercluster, and the Hydra-Centaurus Supercluster are all part of it. The Great Attractor — the gravitational focus we are all falling toward at about 600 km/s — sits behind the plane of the Milky Way, partly obscured by our own galaxy's dust.

The map shown in this shell uses Cosmicflows-4, the most comprehensive peculiar-velocity catalog yet assembled, with measurements for over 50,000 galaxies. The reconstruction of the dark-matter density and velocity fields is itself an active area of research; the boundaries we draw will shift as more data arrives. Laniakea may even turn out to be a part of an even larger structure, just as the Virgo Supercluster turned out to be part of Laniakea.

---

### Shell 8 — Cosmic Web (more info)

**i18n key:** `tour.shell8.more`

On the largest scales we can map directly, matter is not distributed uniformly. It is organised into a network of filaments and walls — sheets of galaxies hundreds of millions of light-years long — surrounding nearly empty regions called voids. This pattern, the *cosmic web*, was predicted by cold-dark-matter cosmology in the 1980s and then observed directly as galaxy redshift surveys (CfA, 2dF, SDSS) reached deeper into the universe.

The web grew from tiny density fluctuations in the early universe — the same fluctuations we see imprinted on the Cosmic Microwave Background (next shell). Slightly denser regions pulled in surrounding matter through gravity; over 13 billion years, the contrast amplified into the dramatic structure we see today. Numerical simulations like the Millennium Run and IllustrisTNG reproduce the observed web to high statistical accuracy, which is one of the strongest confirmations we have that the cold-dark-matter model is on the right track.

Filaments are where most galaxies live. Cluster nodes, where filaments cross, host the densest concentrations and the largest galaxies. Voids — some of which span 100 million light-years or more — are not entirely empty (a handful of galaxies do live there) but contain a small fraction of the cosmic average density.

The filament rendering in this shell is from DisPerSE, an algorithm that traces the topological skeleton of a galaxy point cloud. The input is the same point cloud you have been seeing throughout the tour. The Sloan Great Wall, visible from some camera angles, is one of the largest known coherent structures in the observable universe — a galaxy filament about 1.4 billion light-years long.

---

### Shell 9 — Observable Universe (more info)

**i18n key:** `tour.shell9.more`

The Cosmic Microwave Background (CMB) is the oldest light we can see. It was emitted about 380,000 years after the Big Bang, when the universe had cooled enough for electrons and protons to combine into neutral hydrogen, releasing the photons that had been bouncing through the dense plasma until then. Those photons have been travelling ever since, redshifted by cosmic expansion from their original visible-spectrum glow into the microwave band we detect today.

The map shown is from ESA's Planck mission (2009-2013), the most precise full-sky CMB map yet made. The temperature pattern is extraordinarily uniform — about 2.725 K everywhere — but with tiny fluctuations of about one part in 100,000. Those fluctuations are the *seeds* of every structure we have just flown through: galaxies, clusters, filaments, the cosmic web. The slightly denser spots eventually became the matter-rich regions; the slightly less dense spots became voids.

The "edge" we render is a sphere centered on us, 13.8 billion light-years out in every direction. It is not a physical edge — it is a *visibility horizon*. The universe almost certainly extends much further; we simply cannot see beyond the point where light has not had time to reach us since the Big Bang. Estimates of the unobservable extent range from "a few times larger" to "infinite," depending on which model and which dataset you trust.

The horizon is also not symmetrical in time. As the universe expands, distant regions are moving away from us faster and faster; eventually, they will be carried beyond the horizon and we will lose causal contact with them. In the very far future, observers in the Milky Way will see only a single merged galaxy — what the Local Group becomes — adrift in apparent emptiness.

---

## 4. Button copy

All button labels in one place so the visual designer can size them consistently and so future translation work has a single source. The triangle character (▶) is intentional — it reads as "play" without needing iconography. Use the actual `▶` character (U+25B6), not an `>` substitute.

| Button | i18n key | English copy | Where used |
|---|---|---|---|
| Take tour (initial) | `tour.cta.start` | `Take the tour ▶ (90 s)` | Lower-right, fades in after first tier loads |
| Replay tour | `tour.cta.replay` | `Replay tour ▶` | Lower-right, after tour completes |
| Pause | `tour.cta.pause` | `Pause` | Mid-tour, accessible via on-screen control or `space` key |
| Resume | `tour.cta.resume` | `Resume` | After pause, replaces "Pause" label |
| Free fly | `tour.cta.freefly` | `Free fly` | After pause; ends the tour and returns control |
| Exit tour | `tour.cta.exit` | `Exit tour` | Mid-tour, accessible via on-screen control or `esc` key |

**Notes on phrasing:**

- "Take the tour" is correct, not "Take a tour." The definite article signals there is *one* tour, this one — a deliberate, curated experience rather than a generic option.
- The "(90 s)" annotation on the initial CTA is load-bearing. It signals upfront commitment cost. Removing it would tank the click-through rate; usability research consistently shows users overestimate unknown-duration video lengths and bail.
- "Free fly" rather than "Explore" because skymap's existing UI already uses "Explore" for other things; "Free fly" is unambiguous.
- "Exit tour" rather than "Stop" or "Cancel" because it implies returning to a known state, not abandoning a process.

---

## 5. Error and loading copy

The tour has three failure modes that need user-facing copy: shell-specific data unavailable, full tour cannot start, and degraded rendering fallback. Each gets a single, calm message — no apologies, no jargon, no stack traces.

| Condition | i18n key | Copy |
|---|---|---|
| Shell-specific load (per-shell) | `tour.loading.shell` | `Loading {shellName}…` |
| Tour cannot start (data missing) | `tour.error.startup` | `The tour can't start right now. Try refreshing the page.` |
| Cosmicflows-4 unreachable (Shell 7) | `tour.error.laniakea` | `Couldn't reach the Cosmicflows-4 data — showing a simplified view.` |
| Filament data unreachable (Shell 8) | `tour.error.filaments` | `Filament rendering unavailable — galaxies only.` |
| CMB texture unreachable (Shell 9) | `tour.error.cmb` | `CMB map unavailable — showing a flat sphere.` |
| GPU device lost during tour | `tour.error.gpulost` | `The graphics device was lost. Refresh to restart the tour.` |
| Tour skipped due to mobile constraint | `tour.error.mobile` | `The tour requires a desktop browser. Drag and pinch to explore instead.` |

**Tone notes:**

- The Cosmicflows-4 failure message names the dataset by name. This is deliberate: an audience-2 user (the science-literate enthusiast) will appreciate the specificity, and the audience-1 user simply reads it as "some named thing failed, the tour adapts." Naming the dataset is more honest than vague "couldn't load some data."
- "Refresh to restart" rather than "Click here to retry." Users know how to refresh; we do not need to give them a button that triggers a refresh under the hood. The simpler the failure mode, the more trustworthy the system reads.
- No error message contains the word "error" or "failed." Both are infrastructural words that read as defect; "couldn't reach" and "unavailable" read as conditions.

---

## 6. Per-shell credit lines

Each shell credits its underlying datasets in the bottom-right corner, in a small monospace footer that fades in with the overlay and fades out with it. This is both ethically required (the data is freely shared by surveys that deserve credit) and reputationally useful (audience 2 spots the credits and nods).

| Shell | i18n key | Credit copy |
|---|---|---|
| Sun beat | `tour.credit.sun` | `Solar parameters: NASA / SOHO` |
| 1 Solar System | `tour.credit.solar` | `Orbits: JPL HORIZONS ephemeris` |
| 2 Stellar Neighborhood | `tour.credit.stars` | `Stars: ESA Gaia DR3` |
| 3 Milky Way | `tour.credit.milkyway` | `MW disk: 2MASS XSC + IRAS composite (model)` |
| 4 Local Group | `tour.credit.localgroup` | `Galaxies: Local Volume catalog (Karachentsev et al.)` |
| 5 Local Sheet | `tour.credit.sheet` | `Sheet structure: Cosmicflows-3 + Tully et al.` |
| 6 Virgo Supercluster | `tour.credit.virgo` | `Galaxies: 2MRS · X-ray gas: ROSAT All-Sky Survey` |
| 7 Laniakea | `tour.credit.laniakea` | `Velocity field: Cosmicflows-4 (Tully et al. 2023)` |
| 8 Cosmic Web | `tour.credit.web` | `Galaxies: SDSS + 2MRS + GLADE · Filaments: DisPerSE` |
| 9 Observable Universe | `tour.credit.cmb` | `CMB: ESA Planck SMICA 2018` |

**Format:** `8pt monospace, 60% opacity, lower-right, fades in 1 s after primary overlay, fades out with it.` Credits never block content. They never wrap.

---

## 7. Loading and idle copy

The first-time visitor's first 5-10 seconds matter disproportionately. They need to know (a) something is happening, (b) it will be worth waiting for, (c) what they can do when it is ready.

### Initial page load — before tour CTA appears

The standard skymap loading spinner is reused; no new copy needed. The dataset loader already says `Loading galaxies… {tier} ({count} loaded)`. We do not add "Cosmic zoom incoming" or similar — that would over-promise.

### CTA fade-in — first time

When the first data tier finishes loading and the device is ready, the tour CTA fades in at lower-right over 600 ms. No accompanying tooltip, no pulsing animation, no "New!" badge. The button speaks for itself.

After 30 s of no user interaction with the CTA, a subtle one-line tooltip appears above it, fading in over 800 ms:

> i18n: `tour.idle.hint`
> `New here? Start with the tour.`

This tooltip dismisses on any user input (mouse move, key press, scroll). It does not reappear within the same session.

### Returning visitor — CTA already labelled "Replay tour ▶"

No tooltip. Returning visitors do not need to be re-prompted; they have already made the decision. If they want to replay, the button is right there.

---

## 8. Accessibility alt text

The tour is a visual experience, but it must remain comprehensible to screen-reader users. Each shell has an `aria-label` on the canvas element that updates as the tour progresses. The `aria-live="polite"` region announces the primary overlay copy when it appears, plus a longer scene description.

The scene descriptions below are *what a screen reader says*. They are written in past-perfect-tense flat prose because that is the register screen readers parse most cleanly. They are intentionally longer and more descriptive than the visual overlays — for a screen-reader user, this *is* the content.

| Shell | i18n key | Scene description (announced when shell begins) |
|---|---|---|
| Sun beat | `tour.alt.sun` | The Sun fills the centre of the screen as a glowing yellow disc with subtle surface texture. |
| 1 Solar System | `tour.alt.solar` | The Sun is at the centre. Eight planets orbit it on faint elliptical paths, viewed from above the plane of the Solar System at a slight tilt. Mercury, Venus, Earth, and Mars are inside; Jupiter, Saturn, Uranus, and Neptune are further out. Pluto's orbit forms the outer edge. |
| 2 Stellar Neighborhood | `tour.alt.stars` | Several thousand stars surround the Sun in three dimensions. Each star's colour reflects its temperature: blue stars are hot, yellow stars are Sun-like, red stars are cool. Sirius, Procyon, Altair, and Vega are labelled. A faint diffuse glow at the back of the scene is the rest of the Milky Way. |
| 3 Milky Way | `tour.alt.milkyway` | The Milky Way galaxy fills the view as a flat spiral disc with a central bar. Spiral arms wind outward. The Sun's position is marked with a small pulsing dot, about halfway out from the centre. |
| 4 Local Group | `tour.alt.localgroup` | Two large spiral galaxies — the Milky Way on the right, Andromeda on the left — face each other across millions of light-years. The smaller Triangulum galaxy sits below Andromeda. Dozens of small dwarf galaxies are scattered around them. |
| 5 Local Sheet | `tour.alt.sheet` | A flattened arrangement of galaxy groups spreads across the screen, all confined to a thin plane. Our Local Group sits near the centre. Other named groups — M81, Centaurus A, Sculptor, M101 — appear as small clusters around it. |
| 6 Virgo Supercluster | `tour.alt.virgo` | A dense concentration of galaxies fills the centre of the view, surrounded by a soft red glow that represents X-ray emission from hot gas at 30 million degrees. The galaxy M87 sits at the centre as a bright pulse. |
| 7 Laniakea | `tour.alt.laniakea` | A translucent volumetric field fills the view in shades of purple and blue, brighter along filaments and brightest at cluster nodes. Coloured arrows trace velocity flow lines, all converging toward a single distant point: the Great Attractor. |
| 8 Cosmic Web | `tour.alt.web` | The largest scale of structure becomes visible. Galaxies cluster along filaments billions of light-years long, surrounding vast empty voids. The Sloan Great Wall is highlighted. The cosmic web fills the entire scene. |
| 9 Observable Universe | `tour.alt.cmb` | The view is from inside a sphere — the Cosmic Microwave Background, full sky, mottled in blue and red according to tiny temperature variations. The galaxies and filaments from earlier shells appear as a thin shell of structure near the centre. |

### Keyboard navigation

All tour controls must be reachable by `Tab` order: Pause, Resume, Free fly, Exit tour, Replay. Every interactive element must have a visible focus ring (no `outline: none`). The `space` key shortcut for pause/resume is in addition to, not a replacement for, button-based access.

### Reduced motion

Users with `prefers-reduced-motion: reduce` see a static fallback: a series of nine still images (one per shell) with the primary overlay text alongside, navigable with arrow keys. The tour does not autoplay for these users; the CTA changes copy to `View the tour as still images` (i18n: `tour.cta.start.reduced`).

---

## 9. Editorial process

Copy of this density and ambition cannot ship after one writer's pass. Three review gates apply.

1. **Internal copy review.** Project maintainer (Alex) reads every string aloud, with a stopwatch, against the relevant shell's visual mock. The bar: each primary overlay reads in <8 seconds, no overlay contains a word the maintainer would have to look up to define. This catches roughly 80% of issues — pacing, awkward phrasing, jargon creep.

2. **Science accuracy review.** A working astronomer (or astronomy graduate student) reads every primary and secondary string. The bar (per product vision section "How we'll know it's done"): a college astronomy major should say "yes that's true" to every claim. Stretch goal: a research astronomer should not wince at any specific number, citation, or characterisation. The reviewer is given the shell visual mocks alongside the copy so they can flag mismatches between *what the user sees* and *what the copy claims they're seeing.* Outsource: ideally a paid 2-3 hour engagement with an astronomy postdoc; informally, the maintainer's astro-Twitter network.

3. **Usability test.** Five first-time users (none from the target astronomy audience) watch the full tour with screen recording and think-aloud protocol. We measure: completion rate, places they pause, places they look confused, things they ask. Copy issues that surface here are bugs. Copy issues that surface for *more than one of the five* are launch-blocking.

The error messages, button labels, and credit lines are reviewed by the project maintainer only. They do not require external review — they are infrastructure copy, and the cost of being slightly wrong is low.

---

## 10. Localization

**Out of scope for v1.** English only. (Listed explicitly in the product vision non-goals.)

**Future-proofing for v2+:** every string in this document is tagged with a stable i18n key. All copy lives in a single `tour.copy.en.json` file (path TBD; suggest `src/services/tour/copy/`) keyed by these identifiers. No string is inlined as a literal in component code. When localization is added, only the JSON files need to be created; component code reads `t('tour.shell5.sheet.body')` and is locale-agnostic.

The keys follow a hierarchy: `tour.{section}.{shell}.{role}` for shell content, `tour.{section}.{key}` for global UI. Section is one of: `cta`, `shell0`–`shell9`, `outro`, `error`, `loading`, `idle`, `credit`, `alt`, `more`. This pattern matches existing skymap i18n conventions (see `src/i18n/` if extant; otherwise this defines the convention).

When localization eventually happens, three considerations matter for the primary overlays specifically: (a) the 8-second read-aloud budget is for English; some languages (German, Finnish) may need 20-30% more time, and the overlay timing window will need to flex accordingly; (b) the "we" / "our" warmth depends on the language's grammar of inclusion — Japanese, for instance, has multiple first-person plurals with different connotations and a translator should make a deliberate choice; (c) the units (light-years, km) will need locale-aware rendering — but not unit conversion. The universe is the same size in every locale.

---

## 11. Test criteria

Copy is "done" when:

- [ ] **Read-aloud test passes.** Each primary overlay timed at <8 seconds when read at conversational pace by a non-broadcast voice. The Virgo and CMB overlays are tightest; if either crosses 8 s, trim.
- [ ] **First-time-user comprehension test passes.** In moderated usability sessions, every user (5 of 5) can verbally summarise what each shell showed them within 10 seconds of the overlay fading. If a user cannot summarise a shell, that overlay is unclear and must be revised.
- [ ] **Science reviewer signs off.** No factual error in any primary overlay; no factual error in any "more info" block. Any contested wording (especially around uncertainty — Local Sheet's flatness, Laniakea's boundary) explicitly approved by reviewer.
- [ ] **Accessibility audit passes.** All `aria-label` text present and accurate; reduced-motion fallback functional; keyboard navigation covers every interactive element; Lighthouse accessibility score ≥95 for the tour overlay UI.
- [ ] **All credit lines verified.** Each credit line names the survey or dataset it claims to use; any survey where the data was *almost* used but ultimately not is removed from the credit. No vague "various sources" credits.
- [ ] **All error messages tested.** Each failure mode (Cosmicflows-4 unreachable, filament data unreachable, CMB texture unreachable, GPU device lost) is artificially induced in dev and the corresponding copy verified to appear at the right time, in the right place, with the right tone.
- [ ] **No exclamation marks anywhere.** Grep test. If any string contains `!` (other than in URL fragments), it fails.

---

## 12. Open questions

1. **Should the "more info" content ship in v2 or wait until v3?** Drafting it here proves it can be written, but the side-panel UX (where it appears, how it's triggered, how it interrupts the tour) is non-trivial. Recommendation: ship v1 without it; revisit panel design in v2 once we have telemetry on tour completion rates.

2. **Should the Sun beat have a subtitle line about size scale?** Currently: "1.4 million km across · 8 light-minutes from Earth · about 4.6 billion years old." Three numbers in one line. This is dense but readable as a "data sheet" header. Alternative: split into two lines. Defer to visual design.

3. **Is "Milkomeda" name-droppable in the Local Group "more info" block?** Currently included as a parenthetical. Some astronomers find the portmanteau cute; some find it cringeworthy. Recommendation: keep it parenthetically — readers who dislike it gloss over; readers who like it appreciate the human touch.

4. **Should the credits cite paper DOIs?** Currently they name the dataset and (for Cosmicflows-4 and Planck) the year. Adding full citations would bloat the footer. Recommendation: no. The "more info" block is the place for full citations; the footer is the place for credit acknowledgement.

5. **Should the reduced-motion fallback include the "more info" content inline?** Since reduced-motion users cannot watch the cinematic, they may benefit from the fuller secondary content as compensation. Recommendation: yes, in v2 when the more-info content ships. In v1, the reduced-motion fallback shows only the primary overlay copy.

6. **Do we need to call out that the tour is a "snapshot" rather than animated?** The product vision is explicit: no time-domain. But a first-time visitor may expect to see planets orbiting. Recommendation: do not over-explain; a brief note in a future "About this tour" affordance is sufficient. Adding a beat in the primary overlay copy would dilute it.

7. **What happens to the copy if the Cosmicflows-4 fallback is triggered for Shell 7?** Currently the overlay copy claims "100,000 galaxies all falling toward the same point." If the velocity field is unrendered, the overlay is misleading. Open: should the copy also fall back? Recommendation: yes — define `tour.shell7.laniakea.body.fallback` as `Our home supercluster — defined by the way galaxies are flowing, not by where they sit.` The flow imagery is still implied, even if the field is not rendered.

---

*End of UX content spec. Total word count: ~3,000.*
