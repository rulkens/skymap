// src/components/DebugPanel/CameraStateSection.tsx
/**
 * CameraStateSection — the camera-pivot branch's DebugPanel readout: stored
 * regime vs. rendered arm (highlighting the mismatch window that's a known
 * bug class here), h/R against the engage/disengage hysteresis band, the
 * render loop's epoch vs. the live clock's, and — while a body arm is
 * engaged — the anchor and eye-offset magnitude.
 *
 * Polls at `FrameStatsRow`'s 4 Hz cadence rather than subscribing per-frame,
 * for the same reason every other textual DebugPanel readout does (see
 * `EarthTileAtlasSection`): a human reads numbers a few times a second, and
 * `cameraDebug()` only runs while this section is mounted — DebugPanel itself
 * mounts only while the overlay is open (`App.tsx`'s `d` toggle), so a closed
 * panel costs nothing.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import DebugSection from './DebugSection';
import styles from './CameraStateSection.module.css';

export type CameraStateSectionProps = {
  cameraDebug: () => CameraDebugSnapshot;
};

const POLL_MS = 250;

function frameLabel(frame: PoseFrame): string {
  return frame === 'absolute' ? 'absolute' : `body:${frame.body}`;
}

function CameraStateSection({ cameraDebug }: CameraStateSectionProps): ReactElement {
  const [snap, setSnap] = useState<CameraDebugSnapshot>(cameraDebug);

  useEffect(() => {
    const id = setInterval(() => setSnap(cameraDebug()), POLL_MS);
    return () => clearInterval(id);
  }, [cameraDebug]);

  return (
    <DebugSection title="Camera">
      <div className={snap.armMismatch ? styles.mismatch : styles.readout}>
        stored {frameLabel(snap.storedFrame)} · rendered {frameLabel(snap.renderedFrame)}
        {snap.armMismatch && ' ⚠ MISMATCH'}
      </div>

      <div className={styles.readout}>
        {snap.engagedBodyId === null
          ? 'h/R: — (no body resolved)'
          : `h/R ${snap.engagedBodyId}: ${snap.hOverR?.toFixed(3)} · alt ${snap.altitudeKm?.toFixed(1)} km`}
        {' · engage '}
        {SURFACE_REGIME.engageHR} / disengage {SURFACE_REGIME.disengageHR}
      </div>

      <div className={snap.epochMismatch ? styles.mismatch : styles.readout}>
        epoch: rendered {snap.lastRenderedSimDays.toFixed(6)} · live {snap.liveSimDays.toFixed(6)}
        {snap.epochMismatch && ` ⚠ Δ ${(snap.epochDeltaDays * 86_400).toFixed(2)} s`}
      </div>

      {snap.anchorLocalKm !== null && (
        <div className={styles.readout}>
          anchor [{snap.anchorLocalKm.map((c) => c.toFixed(1)).join(', ')}] km · |eye−anchor|{' '}
          {snap.eyeRelAnchorMagM?.toFixed(1)} m
        </div>
      )}

      <div className={styles.readout}>driver: {snap.activeDriverId}</div>
    </DebugSection>
  );
}

export default CameraStateSection;
