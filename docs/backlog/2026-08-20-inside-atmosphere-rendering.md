# Inside-atmosphere rendering

**Status:** follow-up requested by the user 2026-08-20; not started.

**Problem.** Descending through Earth's atmosphere shell, the atmosphere
instantly disappears the moment the camera crosses the shell boundary — the
in-scatter shell is drawn as an outside-looking-in effect only. From inside
there should be sky: an aerosphere the camera is embedded in (horizon haze,
day-sky in-scatter dome, sun disc glare), fading toward space with altitude.

**Sketch (not yet designed).** An "inside" branch/pass for the atmosphere:
when camera altitude < shell top, render a full-screen (or inward-facing
shell) pass integrating the same scattering model along view rays from the
camera, blending continuously with the outside shell at the crossing so entry
is seamless. Interacts with: the base-globe descent fade (150–300 km window
overlaps atmosphere depth), star/cosmo visibility at low altitude (day sky
should wash out stars), and the sun glint/bloom path.

**Touchpoints (to survey at design time):** atmosphere shell layer + WESL,
cloudShellLayer ordering, earthLayer fade constants, scale/visibility fades
for background layers.
