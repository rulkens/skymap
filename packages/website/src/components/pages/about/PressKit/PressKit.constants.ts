import pressKit from '../../../../data/pressKit.json';

// Four of the kit's pictures, all wide, so they share one row's shape.
export const THUMBS = ['features-hero-glint', 'saturn', 'tour-cosmic-web', 'filaments-derived'];
// Written by `npm run site:press-kit` with the zip it describes.
export const SIZE = `${Math.round(pressKit.bytes / 1e6)} MB`;
