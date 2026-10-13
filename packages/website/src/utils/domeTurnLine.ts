import { twoFigures } from './twoFigures';

// NASA's sidereal rotation period, the figure of the `earth-rotation` fact: one turn against the stars.
const SIDEREAL_DAY_S = 23.9345 * 3600;

/** The domes page's line: how far Earth, and every dome on it, has turned in the `seconds` the page has been open. */
export function domeTurnLine(seconds: number): string {
  const turned = twoFigures((360 * seconds) / SIDEREAL_DAY_S);
  const unit = turned === '1' ? 'degree' : 'degrees';
  return `While this page has been open, every dome on Earth has turned ${turned} ${unit} under the sky. No operator was involved.`;
}
