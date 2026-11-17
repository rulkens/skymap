import type { ProbeSpheresSettings } from '../../@types/ProbeSpheresSettings';

/** Off; once on, a perfect white mirror, which shows the probe it samples as it is. */
export const initialState: ProbeSpheresSettings = {
  enabled: false,
  items: {
    'probe-sphere-orbit': { enabled: true },
    'probe-sphere-soendermarken': { enabled: true },
    'probe-sphere-jezero': { enabled: true },
  },
  color: [1, 1, 1],
  metallic: 1,
  roughness: 0,
};
