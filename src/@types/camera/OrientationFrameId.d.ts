/**
 * OrientationFrameId — which astronomical plane the camera treats as "up".
 *
 * An orientation frame is a choice of pole: "that frame's north pole is up"
 * in the rendered view. The world frame itself never moves (positions stay
 * equatorial J2000) — this only picks which of four physically meaningful
 * poles the camera aligns its up-vector to. The four ids key
 * `ORIENTATION_FRAMES`, the frame-local-to-world basis registry.
 */
export type OrientationFrameId = 'equatorial' | 'ecliptic' | 'galactic' | 'supergalactic';
