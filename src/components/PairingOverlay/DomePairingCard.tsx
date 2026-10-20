/**
 * DomePairingCard — the pairing card for dome mode: painted flat once, pre-warped
 * onto the fisheye at the front of the dome where Earth sits, and laid over a
 * canvas boxed exactly like `#c[data-view-rig='dome']`. The code is also real
 * text, hidden visually, for assistive tech.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DOME_PARAMS } from '../../data/rendering/domeParams';
import { PAIRING_CARD_HALF_WIDTH_RAD } from '../../data/remote/pairingCardHalfWidthRad';
import type { Vec3 } from '../../@types/math/Vec3';
import { degToRad } from '../../utils/math/degToRad';
import { warpCardToFisheye } from '../../utils/dome/warpCardToFisheye';
import { paintPairingCard } from '../../utils/remote/paintPairingCard';
import styles from './DomePairingCard.module.css';

export type DomePairingCardProps = {
  readonly code: string;
  readonly modules: readonly (readonly boolean[])[];
};

const CARD_WIDTH_PX = 600;
const CARD_HEIGHT_PX = 720;
const TILT_RAD = degToRad(DOME_PARAMS.tiltDeg);
/** Dome direction of the camera forward, where Earth sits. */
const FRONT: Vec3 = [0, Math.cos(TILT_RAD), Math.sin(TILT_RAD)];

function DomePairingCard({ code, modules }: DomePairingCardProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const side = canvasRef.current?.getBoundingClientRect().width ?? 0;
      setSize(Math.round(side * window.devicePixelRatio));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const flat = document.createElement('canvas').getContext('2d');
    const out = canvas?.getContext('2d');
    if (size === 0 || !canvas || !flat || !out) return;
    flat.canvas.width = CARD_WIDTH_PX;
    flat.canvas.height = CARD_HEIGHT_PX;
    const fontFamily = getComputedStyle(canvas).fontFamily;
    paintPairingCard(flat, CARD_WIDTH_PX, CARD_HEIGHT_PX, modules, code, fontFamily);
    const card = flat.getImageData(0, 0, CARD_WIDTH_PX, CARD_HEIGHT_PX);
    const pixels = warpCardToFisheye(card, size, FRONT, PAIRING_CARD_HALF_WIDTH_RAD);
    canvas.width = size;
    canvas.height = size;
    out.putImageData(new ImageData(pixels, size, size), 0, 0);
  }, [size, code, modules]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.root} aria-hidden="true" />
      <p className={styles.sr} role="status" aria-label="Pair a remote">
        Pair a remote. Room code {code}
      </p>
    </>
  );
}

export default DomePairingCard;
