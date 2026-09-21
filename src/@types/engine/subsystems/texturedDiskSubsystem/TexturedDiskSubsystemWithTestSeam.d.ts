import type { TexturedDiskTestState } from './TexturedDiskTestState';

export type TexturedDiskSubsystemWithTestSeam = TexturedDiskSubsystem & {
  __testGetState(): TexturedDiskTestState;
};
