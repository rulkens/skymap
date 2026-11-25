/**
 * SimulationFrameRate — the Simulation icon's tip text: the frame rate while the
 * sim runs, `running` before the first sample, `paused` when stopped. Its own
 * selector returns the text, so a new sample re-renders this text alone.
 */
import type { ReactNode } from 'react';
import { useAppSelector } from '../../store/hooks';
import { formatFps } from '../formatFps';

function SimulationFrameRate(): ReactNode {
  return useAppSelector((s) =>
    !s.sim.running ? 'paused' : s.view.fps > 0 ? formatFps(s.view.fps) : 'running',
  );
}

export default SimulationFrameRate;
