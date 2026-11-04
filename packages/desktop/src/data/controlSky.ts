/**
 * The website's star field as the control window draws it: still, about 90° of sky across, Orion in
 * the middle, a little dimmer than the site's (ALPHA, RADIUS) because a window is looked at for longer.
 */
export const CONTROL_SKY = {
  degAcross: 90,
  minPxPerDeg: 12,
  magBright: -1,
  magFaint: 6,
  alpha: [0.25, 0.85],
  radius: [0.6, 2.6],
  // A star is solid to its radius, then a dim halo runs out to radius / core.
  core: 0.4,
  // What stars keep clear of, as on the site: anything a person reads or uses.
  cleared:
    'h1, h2, h3, p, li, dt, dd, label, button, select, input, canvas, svg, kbd, [role="progressbar"]',
  pad: 6,
  feather: 48,
} as const;
