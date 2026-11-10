/** Whether a tick's label (starting at the tick, `labelPx` wide) would sit under the playhead tag centred on `headPx` and `headPx` wide. */
export function labelUnderHead(
  tickPx: number,
  labelPx: number,
  headPx: number,
  headWidthPx: number,
): boolean {
  return tickPx < headPx + headWidthPx / 2 && tickPx + labelPx > headPx - headWidthPx / 2;
}
