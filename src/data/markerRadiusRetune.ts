/**
 * markerRadiusRetune — factor the structure marker shaders fold into the world
 * radius of a ring, so the line drawn at |uv| == 1 sits at `radiusMpc` × this.
 *
 * The WESL twin `MARKER_RADIUS_RETUNE` in `structureMarker/io.wesl` is what the
 * quad is built from; this mirror lets CPU-side placement (labels above the
 * ring) clear the drawn line, and a parity test pins the two together.
 */

export const MARKER_RADIUS_RETUNE = 0.57735;
