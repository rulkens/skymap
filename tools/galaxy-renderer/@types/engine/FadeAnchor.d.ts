/**
 * FadeAnchor — which point in GENERATOR space the Milky-Way visibility fade
 * measures the camera's distance from.
 *
 * The app keys both fade bands on `hypot(drawCamPos)`, the distance from the
 * heliocentric render origin — the SUN. This tool's camera orbits the
 * generator origin, which is the GALACTIC CENTRE, ~8 kpc away. Those are
 * different quantities and they produce visibly different fades, so the anchor
 * is a control rather than a constant: `'sun'` reproduces the app (including
 * its bug — flying to Sgr A* leaves you 8 kpc from the Sun, four times beyond
 * `fullAt`, so the cloud never fades), `'galacticCentre'` shows what a fix
 * would look like.
 */

export type FadeAnchor = 'sun' | 'galacticCentre' | 'none';
