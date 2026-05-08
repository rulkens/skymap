# Aesthetic References

This document is the visual-language reference sheet for the cosmic zoom. It exists so that two engineers, two designers, and a future contractor can all answer "what is this supposed to look like?" by pointing at the same set of touchstones.

The product vision in [`00-product-vision.md`](00-product-vision.md) calls the look "an observatory readout meets science journalism." This document expands that phrase into specific cinematic, game, and web references, then commits to concrete palette, typography, motion, and chrome decisions.

No images are embedded — text descriptions only, with works cited by name so a reader can pull them up themselves.

## 1. Overall aesthetic

The visual register we are aiming for sits on a narrow axis between two reference points:

- **Observatory readout.** Picture the screen of a research vessel's nav console, or the JWST Mission Operations Center. Black backgrounds, monospaced numerical telemetry, restrained accent colors, no decorative chrome. The screen exists to convey measurement, not entertainment.
- **Science journalism.** Picture a New York Times graphics-desk explainer, or a Quanta Magazine animated diagram. Generous whitespace, a single sans-serif typeface for prose, careful use of color to encode a single dimension (temperature, redshift, density), restraint everywhere.

Both references share three properties: **restraint, legibility, and respect for the data.** None of them try to be cinematic in a Hollywood sense. None of them use volumetric god-rays, lens flares, or particle confetti to signal "epic." The thing being shown is already epic; the visual job is to get out of its way.

What we explicitly avoid: the saturated neon-purple-and-cyan aesthetic of contemporary "space" branding (most planetarium-app icons, every cryptocurrency landing page, the marketing materials for half the games on Steam). It reads as decorative rather than measured.

## 2. Cinematic references

### The Eames "Powers of Ten" (1977)

The single most important reference. Charles and Ray Eames' nine-minute film is the structural template for the entire tour: log-scale zoom-out, constant on-screen pacing despite exponential physical motion, sparse on-screen text labelling each scale, no music, deliberate voiceover.

What we take from it:

- **Constant log-scale velocity.** The Eames film moves the camera at one power of ten per ten seconds. We do similar — each shell crosses ~1.5 orders of magnitude in roughly the same wall-clock time. The user's *perceived* speed should feel uniform; the *physical* speed accelerates exponentially.
- **Title cards as anchors.** The Eames film overlays the current scale ("10⁰ meters", "10¹ meters", ...) at every step. We do an equivalent with shell names and scale annotations.
- **No music during the cosmic phase.** Philip Glass-style ambient is tempting; Eames went without and trusted the visual. So do we (see Section 8).

What we deliberately depart from:

- **No voiceover.** Eames had Philip Morrison narrating throughout. We use silent on-screen text instead, because audio makes the experience harder to embed in social posts, harder to localize, and harder to skim. The product vision is unambiguous on this — see [`00-product-vision.md`](00-product-vision.md) §"Non-goals".
- **Real data, not illustrations.** The Eames film used painted illustrations at every scale. We use measured surveys.

### Christopher Nolan, "Interstellar" (2014)

Reference for: the rendering of large astronomical objects (Gargantua, Miller's planet's tidal field), the spacecraft-instrument typography on the Endurance and the Ranger, and the general "this is engineered, not magical" aesthetic.

What we take:

- **Treatment of the singular massive object.** Gargantua is rendered as something that *has* physics — the accretion disc lensing, the photon ring. When we render the Milky Way disk in Shell 3, we want the same sense of "this is a real structure, viewed from outside, with real depth and real dust." Not a flat illustration.
- **The Endurance HUD.** The typography on the Endurance's nav screens — JetBrains Mono-adjacent, white-on-black, no chrome — is exactly the register our overlay HUD should hit. Numerical readouts feel measured, not decorative.
- **Slow camera motion at scale.** Nolan's exterior shots of the Endurance moving through space are deliberately slow. Big things should *feel* big by moving like they have inertia. Our camera does not snap; it settles.

### Robert Zemeckis, "Contact" (1997)

Reference for: the opening cosmic-zoom-out, which is the direct cinematic ancestor of our tour. The Contact opening pulls the camera from Earth out through the Solar System, past the Milky Way, through the Local Group, and finally to a CGI representation of large-scale structure, before reversing into Ellie Arroway's eye. It is roughly the same shot we are building, twenty-eight years later, with real data instead of 1997 CGI and at interactive frame rates instead of pre-rendered.

What we take:

- **The reversal trick.** Contact ends the zoom-out with a small but profound payoff (the camera reveals itself to be inside the human protagonist). Our tour ends with a return to the user's wide-angle default view — a quieter version of the same payoff. The user sees that all the structure they just flew through is *here*, in this view they were already looking at.
- **Trust the silence.** The Contact opening has only diegetic radio chatter as audio. The visual carries the weight.

What we differ on: Contact's CGI was ambitious for 1997 but is now visibly dated. We have an opportunity to do this shot in a way that holds up for the next decade by leaning on real survey data rather than pre-rendered art.

### Terrence Malick, "The Tree of Life" (2011)

Reference for: the cosmic-genesis sequence (visual effects supervised by Douglas Trumbull, photographed by Emmanuel Lubezki). It is the most beautiful sequence of cosmic imagery ever put on film, full stop.

What we take:

- **Restraint of motion.** Lubezki's camera in that sequence drifts, never charges. Our tour camera operates with the same weight.
- **Color emerging from black.** The Tree of Life sequence opens in absolute black and lets color bloom from within it — a single warm gradient against negative space. Our deepest shells (CMB, Cosmic Web) should do the same. The black is the canvas; color is precious.

What we differ on: Malick's sequence is non-narrative, dreamlike, and abstract. Ours is structured and informative. We borrow the *visual restraint* without the abstraction.

### Carl Sagan's "Cosmos" (1980 + 2014 reboot)

Reference for: overlay graphic style and the tonal register of explanatory copy.

What we take:

- **The "Spaceship of the Imagination" framing.** Both versions of Cosmos render the universe as something the viewer is touring on a vessel, with measured, calm narration. Our copy adopts that voice.
- **Diagrams over photos.** When the original Cosmos illustrated a concept (the cosmic calendar, the scale of the universe), it used custom graphics, not stock photography. Each diagram had a clear visual hierarchy. Our overlay text and shell labels should feel of a piece with that style — designed, not assembled.
- **The 2014 reboot's "Ship of the Imagination" sequences** push this further with high-end VFX. They are a useful reference for *how much* CGI is enough — generally less than they used. The original 1980 series, with simpler graphics, often hits the same emotional note with less.

## 3. Game references

### Kerbal Space Program

Reference for: planet-scale precision, the floating-origin coordinate system, and the orbital-mechanics aesthetic.

What we take:

- **Scale legibility.** KSP makes a Kerbin-orbit insertion *feel* like crossing a real distance. The map view's zoom-out is a working prior art for our log-scale camera.
- **Floating origin.** KSP is a 32-bit-float game that handles distances from rocket-engine geometry (millimeters) to interplanetary (gigameters). The pattern — recompute world relative to the camera each frame — is exactly what our scale-architecture refactor needs. See [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md).

### Elite: Dangerous

Reference for: galaxy-scale travel and the "supercruise" zoom-out.

What we take:

- **Apparent-speed compression.** Elite's supercruise mode lets the player traverse a star system at near-c without feeling lost, by visually compressing star approach so the player always sees their destination growing. Our tour does the equivalent — at log-scale velocity, the destination shell grows at a perceptually constant rate.
- **The galaxy map UI.** Elite's galaxy map renders the Milky Way as a 3D point cloud the player can navigate. It is the closest existing reference to skymap's rendering register. We are doing a more curated, less open-ended version of the same idea.

What we differ on: Elite's UI is heavy with HUD elements. Ours is minimal.

### Outer Wilds

Reference for: cosmic intimacy and the discovery aesthetic.

What we take:

- **The universe as a place to discover, not conquer.** Outer Wilds frames space as something to wonder at, not extract resources from. Our tour adopts the same posture.
- **Diegetic music sparingly used.** Outer Wilds has music, but it is held back for moments of significance. If we ever add audio (we won't in v1, see Section 8), this restraint is the model.

### No Man's Sky — what NOT to do

A useful negative reference. No Man's Sky is visually striking but cartoony — saturated palettes, alien biomes that read as fantasy, planets that all have the same fog density and color treatment regardless of physics. The aesthetic is *toy box* rather than *observatory*.

We avoid: oversaturation, the purple-pink color palette as default, particles for their own sake, and any rendering choice that would make a research astronomer wince.

## 4. Web product references

### WorldWide Telescope

Originally a Microsoft Research project, now an open-source product hosted by the AAS. It is the most ambitious cosmic-scale web product to date. It can fly from Earth to the CMB, displays real survey overlays (DSS, SDSS, Spitzer), and supports authored "guided tours."

What it does well: data integration, tour authoring, breadth of catalogs.

Where it is dated: the visual chrome is from a different era (Windows Vista–era panels, gradient buttons), the camera motion is jerky, and the typography is the system default. The experience, even when impressive, doesn't *feel* contemporary.

What we take: the tour-as-first-class-experience idea. WorldWide Telescope's authored tours are exactly what our cosmic zoom is, just with a more modern visual register.

### Stellarium Web

A solid, conservative sky-charting product. It does what it does very well — accurate sky simulation for any time and location, clean sans-serif typography, restrained UI.

What it does well: typography restraint, accurate astronomical labels, no nonsense.

What it doesn't do: cosmic-scale travel. It's a sky chart, not a 3D universe. Once you leave Earth's surface, it has nothing to show you.

What we take: typography discipline. Stellarium Web's interface uses one sans-serif at three sizes and gets out of the way. Our prose overlay should hit the same note.

### Solar System Scope

A simple, compelling Solar-System-only model. The strength is its single-purpose focus and its nice rendered planet textures. The weakness is that Solar System is the entire scope.

What we take: the lesson that doing *one* scale extremely well is more compelling than doing every scale poorly. Each of our nine shells should feel as polished as Solar System Scope feels at its single scale.

## 5. Color palette

A specific, named palette that we will commit to via CSS custom properties in the design system.

**Background colors:**
- `--bg-deep: #000000` — pure black, used as the canvas behind the WebGPU view.
- `--bg-overlay: rgba(0, 0, 0, 0.72)` — for the overlay text panels' optional background tint when contrast against bright nebulae or CMB requires it.

**Foreground / typography:**
- `--text-primary: #F2F2F2` — near-white for headline overlay text.
- `--text-secondary: #B8B8B8` — neutral gray for supporting copy.
- `--text-mono: #E8E8E8` — slightly different shade for monospaced numerical readouts, so the eye registers them as a different register.

**Accent colors (used sparingly, encoding data dimensions):**
- `--accent-warm: #FFB347` — soft amber, used for the Sun, for solar-spectrum stars, for "warm" indicators in the HUD. Replaces what would otherwise be saturated yellow.
- `--accent-cool: #6FA8DC` — muted steel blue, for cool-spectrum stars, for distant indicators, for "informational" UI.
- `--accent-data-red: #C9483D` — desaturated red, used for the X-ray cluster glow in Shell 6 (Virgo) and for high-density regions in Shell 7 (Laniakea volumetrics). Never used as a UI accent — it is reserved for data encoding.

**The palette has no purple, no pink, no cyan, no neon green.** This is deliberate. The moment a UI accent color reads as "video game space," we have lost the observatory register.

When we encode galaxy color from real BP-RP photometry, we do not constrain those colors to the palette — those *are* the data. The palette governs UI chrome only.

## 6. Typography

Two faces, full stop.

**JetBrains Mono** for all numerical readouts, scale annotations, coordinates, and HUD telemetry. Already in the planned MSDF atlas (see the in-flight MSDF labels spec). JetBrains Mono is chosen over alternatives (IBM Plex Mono, Berkeley Mono, Source Code Pro) for these properties: zero ambiguity between O/0 and l/1/I, generous x-height that survives down-scaling, and an existing OFL license. It reads as "engineered" without reading as "retro terminal."

**System sans-serif stack** for prose overlay: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. We do not load a custom web font for prose because (a) the user will see overlay text within the first 8 seconds of the tour, before a web font would have time to download and FOUT-flash, and (b) every operating system's default sans-serif is now extremely good. Stellarium Web makes this choice; so do most science-journalism sites.

Sizes: prose overlay is 18px on desktop, 16px on mobile. Headlines (the shell name) are 28px on desktop, 22px on mobile. Mono telemetry is 13px throughout.

Line-height is 1.5 for prose, 1.2 for mono.

## 7. Motion

**The default camera speed is one power of ten per six to eleven seconds**, depending on shell. See the timing breakdown in [`01-narrative-script.md`](01-narrative-script.md). Slower than Eames; comparable to Contact's opening shot.

Easing is **cubic ease-in-out** at every transition. No overshoot. No bounce. No snap. The camera always feels weighted — as if it has mass and the engine has to spend energy to accelerate or decelerate it.

Camera angular motion (orbital pans) uses the same easing curve and never exceeds ~5° per second at any scale. Faster angular motion creates motion-sickness on a 27-inch monitor; slower feels glacial. Five degrees per second is the empirical sweet spot.

Overlay text fades use a 1-second cubic ease-in for entrance and an 0.6-second linear fade for exit. The asymmetry is deliberate: text should arrive softly and leave decisively, so the user's eye doesn't track a slow-fading element while trying to read the next one.

## 8. Sound

**v1: none.** The product vision is unambiguous.

If a v2 ever adds audio, the reference would be: the ambient bed of *Blade Runner 2049* (Hans Zimmer's drone work, not the melodic themes), or the title-card pads from *Cosmos: A Spacetime Odyssey*. Sub-audible, ambient, without melody, without rhythm. Never music in the conventional sense. Never voiceover (the product vision rules this out).

The reason to even speculate is to lock the design boundary: if someone in the future proposes adding "epic orchestral music" to the cosmic zoom, the answer is no. The aesthetic is observatory, not movie trailer.

## 9. UI chrome

The canonical aesthetic statement: **the universe is the interface.** Everything else gets out of the way.

Concretely, during the tour:

- The settings panel is collapsed off-screen.
- The corner widgets (status bar, scale bar) fade to 50% opacity.
- The cursor disappears after 2 seconds of inactivity.
- The only on-screen chrome is the overlay text and the lower-right "Replay" button.

When the user pauses the tour to free-fly, the chrome fades back in with a 0.3-second ease — they are now in the regular skymap product, not the cinematic.

The "Take the tour" button itself, before the tour begins, is a single rounded rectangle in the lower-right corner: white text on a 30%-opacity black background, with a small play-triangle icon and the duration "(90 s)" in mono after the label. No drop shadow, no gradient, no border. It should look like a caption, not a CTA.

## Cross-references

- Product vision: [`00-product-vision.md`](00-product-vision.md)
- Narrative script: [`01-narrative-script.md`](01-narrative-script.md)
- Comparison products: [`03-comparison-products.md`](03-comparison-products.md)
- Information overlay system: [`../ux/01-information-overlays.md`](../ux/01-information-overlays.md)
- Camera choreography: [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md)
