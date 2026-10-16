/**
 * PairingOverlay — the dome's invitation to a remote: a QR of the pairing address, with the
 * address and room code as text for a device that cannot scan. The container removes it once
 * a remote has paired.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import styles from './PairingOverlay.module.css';

export type PairingOverlayProps = {
  readonly code: string;
  readonly pairingUrl: string;
};

const QUIET_ZONE_MODULES = 2;

function qrPath(text: string): { path: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        path += `M${col + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`;
      }
    }
  }
  return { path, size: count + QUIET_ZONE_MODULES * 2 };
}

function PairingOverlay({ code, pairingUrl }: PairingOverlayProps): ReactNode {
  const { path, size } = useMemo(() => qrPath(pairingUrl), [pairingUrl]);
  return (
    <div className={styles.root} role="status" aria-label="Pair a remote">
      <h2 className={styles.title}>Pair a remote</h2>
      <svg
        className={styles.qr}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label="QR code for the pairing address"
      >
        <rect width={size} height={size} className={styles.qrLight} />
        <path d={path} className={styles.qrDark} />
      </svg>
      <p className={styles.hint}>Scan with a phone on the same network, or open</p>
      <p className={styles.address}>{pairingUrl}</p>
      <p className={styles.code}>
        <span className={styles.codeLabel}>Room code</span> <span>{code}</span>
      </p>
    </div>
  );
}

export default PairingOverlay;
