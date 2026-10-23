/**
 * Trackpad — the surface whose pointer, touch and wheel events steer the dome's camera. The
 * element is childless on purpose: the device channel drops a hover whose target is not the
 * element itself, so its label is a sibling the pointer passes through.
 */

import { useEffect, useRef } from 'react';
import { END } from 'redux-saga';
import { createDeviceChannel } from '../../../services/input/createDeviceChannel';
import { stampAxisMods } from '../../../utils/remote/stampAxisMods';
import { AXIS_HINTS } from '../../../data/remote/axisHints';
import type { RemoteNavAxis } from '../../../@types/remote/RemoteNavAxis';
import type { DeviceEvent } from '../../../@types/input/DeviceEvent';
import styles from './Trackpad.module.css';

/** `axis` is null under the skymap scheme, where events go out untouched. */
export type TrackpadProps = {
  onEvent: (event: DeviceEvent) => void;
  axis: RemoteNavAxis | null;
};

function Trackpad({ onEvent, axis }: TrackpadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const axisRef = useRef(axis);
  axisRef.current = axis;

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    const channel = createDeviceChannel(pad);
    const pump = (): void =>
      channel.take((message) => {
        if (message === END) return;
        const event = message as DeviceEvent;
        onEventRef.current(axisRef.current ? stampAxisMods(event, axisRef.current) : event);
        pump();
      });
    pump();
    return () => channel.close();
  }, []);

  return (
    <div className={styles.frame}>
      <div ref={padRef} className={styles.pad} />
      <span className={styles.label}>{AXIS_HINTS[axis ?? 'orbit']}</span>
    </div>
  );
}

export default Trackpad;
