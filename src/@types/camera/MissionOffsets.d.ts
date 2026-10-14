/** MissionOffsets — a visitor's orbit (radians) and zoom (a distance multiplier) inside the mission frame. */
export type MissionOffsets = {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
};
