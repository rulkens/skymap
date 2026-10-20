/**
 * Trackpad — the surface whose pointer, touch and wheel events steer the dome's camera. The
 * element is childless on purpose: the device channel drops a hover whose target is not the
 * element itself, so its label is a sibling the pointer passes through.
 */

import { useEffect, useRef } from 'react';
import { END } from 'redux-saga';
import { createDeviceChannel } from '../../../services/input/createDeviceChannel';
import type { DeviceEvent } from '../../../@types/input/DeviceEvent';
import styles from './Trackpad.module.css';

export type TrackpadProps = { onEvent: (event: DeviceEvent) => void };

function Trackpad({ onEvent }: TrackpadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    const channel = createDeviceChannel(pad);
    const pump = (): void =>
      channel.take((message) => {
        if (message === END) return;
        onEventRef.current(message as DeviceEvent);
        pump();
      });
    pump();
    return () => channel.close();
  }, []);

  return (
    <div className={styles.frame}>
      <div ref={padRef} className={styles.pad} />
      <span className={styles.label}>Drag to orbit, pinch to zoom</span>
    </div>
  );
}

export default Trackpad;
