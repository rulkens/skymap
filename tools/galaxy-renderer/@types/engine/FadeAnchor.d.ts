/**
 * FadeAnchor — which point in GENERATOR space the Milky-Way visibility fade
 * measures the camera's distance from.
 *
 * The app keys both fade bands on distance from the heliocentric render
 * origin (the SUN); this tool's camera orbits the GALACTIC CENTRE, ~8 kpc
 * away, so the two anchors produce visibly different fades. `'sun'`
 * reproduces the app exactly, including its bug — flying to Sgr A* leaves you
 * 8 kpc from the Sun, four times beyond `fullAt`, so the cloud never fades —
 * and `'galacticCentre'` shows what a fix would look like.
 */

export type FadeAnchor = 'sun' | 'galacticCentre' | 'none';
