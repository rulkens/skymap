/**
 * PairingOverlay — the dome's invitation to a remote: a QR of the pairing address, with the
 * address and room code as text for a device that cannot scan. The container removes it once
 * a remote has paired. In dome mode the same content is pre-warped onto the fisheye instead,
 * plus a flat QR in the top-left corner, outside the disc, which a phone can scan off a monitor.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { hasUrlGate } from '../../utils/url/hasUrlGate';
import { qrModules } from '../../utils/remote/qrModules';
import DomePairingCard from './DomePairingCard';
import styles from './PairingOverlay.module.css';

export type PairingOverlayProps = {
  readonly code: string;
  readonly pairingUrl: string;
};

const QUIET_ZONE_MODULES = 2;

function qrPath(modules: readonly (readonly boolean[])[]): { path: string; size: number } {
  let path = '';
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) path += `M${c + QUIET_ZONE_MODULES} ${r + QUIET_ZONE_MODULES}h1v1h-1z`;
    }),
  );
  return { path, size: modules.length + QUIET_ZONE_MODULES * 2 };
}

function QrSvg({
  modules,
  className,
}: {
  modules: readonly (readonly boolean[])[];
  className: string | undefined;
}): ReactNode {
  const { path, size } = qrPath(modules);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for the pairing address"
    >
      <rect width={size} height={size} className={styles.qrLight} />
      <path d={path} className={styles.qrDark} />
    </svg>
  );
}

function PairingOverlay({ code, pairingUrl }: PairingOverlayProps): ReactNode {
  const modules = useMemo(() => qrModules(pairingUrl), [pairingUrl]);
  // A dome shows a fisheye, where a flat DOM card would sit huge and distorted on the zenith.
  if (hasUrlGate('dome')) {
    return (
      <>
        <DomePairingCard code={code} modules={modules} />
        <QrSvg modules={modules} className={styles.cornerQr} />
      </>
    );
  }
  return (
    <div className={styles.root} role="status" aria-label="Pair a remote">
      <h2 className={styles.title}>Pair a remote</h2>
      <QrSvg modules={modules} className={styles.qr} />
      <p className={styles.hint}>Scan with a phone on the same network, or open</p>
      <p className={styles.address}>{pairingUrl}</p>
      <p className={styles.code}>
        <span className={styles.codeLabel}>Room code</span> <span>{code}</span>
      </p>
    </div>
  );
}

export default PairingOverlay;
