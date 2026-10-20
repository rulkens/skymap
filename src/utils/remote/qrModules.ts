/** qrModules — the dark/light module grid of a QR for `text` (error correction M), no quiet zone. */

import qrcode from 'qrcode-generator';

export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
  );
}
