import { svgDocument } from './svgDocument';

export const SCALE_POINTER_SIZE = 11;

/** The slider's pointer on the scale of miles: an engraved lozenge with an inked heart. */
export function scalePointerSvg(ink: string, ground: string): string {
  return svgDocument(
    SCALE_POINTER_SIZE,
    SCALE_POINTER_SIZE,
    `<path d="M5.5 .6L10.4 5.5L5.5 10.4L.6 5.5Z" fill="${ground}" stroke="${ink}" stroke-width="1"/>` +
      `<path d="M5.5 3.3L7.7 5.5L5.5 7.7L3.3 5.5Z" fill="${ink}"/>`,
  );
}
