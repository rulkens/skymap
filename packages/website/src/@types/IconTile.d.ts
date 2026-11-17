/**
 * The ground a Skymap icon sits on: `mac` is Apple's 1024 grid (an 824 superellipse with a drop shadow),
 * `rounded` a full-bleed rounded square (the favicon, Windows), `square` a plain square for platforms
 * that round the corners themselves (the apple-touch-icon).
 */
export type IconTile = 'mac' | 'rounded' | 'square';
