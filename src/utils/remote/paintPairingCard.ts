/**
 * paintPairingCard — draws the dome's pairing card flat: light ground, title, QR,
 * room code. No address line: it is unreadable at dome scale, and the QR carries it.
 */

const QUIET_ZONE_MODULES = 2;
const INK = '#000';
const PAPER = '#f4f4f0';

export function paintPairingCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  modules: readonly (readonly boolean[])[],
  code: string,
  fontFamily: string,
): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${height * 0.08}px ${fontFamily}`;
  ctx.fillText('Pair a remote', width / 2, height * 0.08);

  const pad = width * 0.06;
  const cell = (width - 2 * pad) / (modules.length + 2 * QUIET_ZONE_MODULES);
  const top = height * 0.16;
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      // Floor the origin and ceil the extent so neighbouring modules never leave a seam.
      const x = pad + (c + QUIET_ZONE_MODULES) * cell;
      const y = top + (r + QUIET_ZONE_MODULES) * cell;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cell), Math.ceil(cell));
    }),
  );

  ctx.font = `600 ${height * 0.1}px ${fontFamily}`;
  ctx.fillText(code, width / 2, height * 0.93);
}
