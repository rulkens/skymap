import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { qrModules } from '../../../../../../../src/utils/remote/qrModules';
import styles from './PairingQr.module.css';

export type PairingQrProps = {
  readonly text: string;
};

/** One canvas pixel per module, scaled up by CSS with pixelated rendering. */
function PairingQr({ text }: PairingQrProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modules = useMemo(() => qrModules(text), [text]);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        ctx.fillStyle = dark ? '#000' : '#fff';
        ctx.fillRect(x, y, 1, 1);
      }),
    );
  }, [modules]);
  return (
    <canvas
      ref={canvasRef}
      className={styles.root}
      width={modules.length}
      height={modules.length}
      role="img"
      aria-label="Pairing QR code"
    />
  );
}

export default PairingQr;
