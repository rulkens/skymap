/** qrModules — the dark/light module grid of a QR for `text` (error correction M), with a light quiet zone around it. */

import qrcode from 'qrcode-generator';

const QUIET_ZONE_MODULES = 2;

export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const inCode = (i: number): boolean => i >= 0 && i < count;
  return Array.from({ length: count + 2 * QUIET_ZONE_MODULES }, (_, row) =>
    Array.from({ length: count + 2 * QUIET_ZONE_MODULES }, (_, col) => {
      const r = row - QUIET_ZONE_MODULES;
      const c = col - QUIET_ZONE_MODULES;
      return inCode(r) && inCode(c) && qr.isDark(r, c);
    }),
  );
}
