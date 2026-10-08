/** Light-travel-distance spheres centred on Earth: radius in Mpc plus caption text. */

import type { LightTimeSphere } from '../../layers/lightTime/@types/LightTimeSphere';
import { SCALE_UNITS } from '../scaleUnits';

const LY = SCALE_UNITS.LY_TO_MPC;
const SECONDS_PER_YEAR = 31_557_600;
const lightSeconds = (seconds: number) => (seconds / SECONDS_PER_YEAR) * LY;

export const LIGHT_TIME_SPHERES: readonly LightTimeSphere[] = [
  { id: 'light-time:second', text: '1 light-second', radiusMpc: lightSeconds(1) },
  { id: 'light-time:minute', text: '1 light-minute', radiusMpc: lightSeconds(60) },
  { id: 'light-time:hour', text: '1 light-hour', radiusMpc: lightSeconds(3_600) },
  { id: 'light-time:day', text: '1 light-day', radiusMpc: lightSeconds(86_400) },
  { id: 'light-time:month', text: '1 light-month', radiusMpc: LY / 12 },
  { id: 'light-time:year', text: '1 light-year', radiusMpc: LY },
  { id: 'light-time:10-years', text: '10 light-years', radiusMpc: 10 * LY },
  { id: 'light-time:100-years', text: '100 light-years', radiusMpc: 100 * LY },
  { id: 'light-time:1e3-years', text: '1,000 light-years', radiusMpc: 1e3 * LY },
  { id: 'light-time:1e4-years', text: '10,000 light-years', radiusMpc: 1e4 * LY },
  { id: 'light-time:1e5-years', text: '100,000 light-years', radiusMpc: 1e5 * LY },
  { id: 'light-time:1e6-years', text: '1 million light-years', radiusMpc: 1e6 * LY },
  { id: 'light-time:1e7-years', text: '10 million light-years', radiusMpc: 1e7 * LY },
  { id: 'light-time:1e8-years', text: '100 million light-years', radiusMpc: 1e8 * LY },
  { id: 'light-time:1e9-years', text: '1 billion light-years', radiusMpc: 1e9 * LY },
];
