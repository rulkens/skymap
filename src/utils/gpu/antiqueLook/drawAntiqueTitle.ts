/**
 * drawAntiqueTitle — sets one cartouche title (`fitAntiqueTitle`) in IM Fell
 * English on a 2D canvas, filling the ellipse inscribed in the block `x, y, w, h`.
 * Canvas metrics stand in for the font outlines: ink boxes from
 * `actualBoundingBox*`, measured at 100 px so a 1 px em keeps its precision.
 */

import type { AntiqueTitleGroup } from '../../../@types/rendering/AntiqueTitleGroup';
import type { AntiqueTitleLine } from '../../../@types/rendering/AntiqueTitleLine';
import { fitAntiqueTitle } from './fitAntiqueTitle';

const PROBE_PX = 100;

export function drawAntiqueTitle(
  g: OffscreenCanvasRenderingContext2D,
  family: string,
  groups: readonly AntiqueTitleGroup[],
  block: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): void {
  const setFont = (line: Omit<AntiqueTitleLine, 'text'>, px: number) => {
    g.font = `${line.face === 'italic' ? 'italic ' : ''}${px}px "${family}"`;
    g.letterSpacing = `${line.tracking * px}px`;
  };
  const measure = (line: AntiqueTitleLine) => {
    setFont(line, PROBE_PX);
    const m = g.measureText(line.text);
    const cap = g.measureText('H').actualBoundingBoxAscent;
    return {
      width: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / PROBE_PX,
      height: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / PROBE_PX,
      cap: cap / PROBE_PX,
    };
  };
  const cx = block.x + block.w / 2;
  const cy = block.y + block.h / 2;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  for (const { line, em, squeeze, top } of fitAntiqueTitle(
    groups,
    measure,
    block.w / 2,
    block.h / 2,
  )) {
    setFont(line, em);
    const m = g.measureText(line.text);
    g.save();
    g.translate(cx, cy + top + m.actualBoundingBoxAscent);
    g.scale(squeeze, 1);
    g.fillText(line.text, (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, 0);
    g.restore();
  }
}
