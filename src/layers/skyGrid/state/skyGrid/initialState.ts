import type { SkyGridSettings } from '../../../../@types/settings/SkyGridSettings';

export const initialState: SkyGridSettings = {
  enabled: false,
  frames: { equatorial: true, ecliptic: false, galactic: true, supergalactic: false },
};
