import type { ProbeSphereId } from '../../@types/ProbeSphereId';

/** The DebugPanel section's go-to row: one button per sphere, focused as a palette pick is. */
export const PROBE_SPHERE_GO_TO_BUTTONS = [
  { id: 'probe-sphere-orbit', label: 'Orbit' },
  { id: 'probe-sphere-soendermarken', label: 'Søndermarken' },
  { id: 'probe-sphere-jezero', label: 'Jezero' },
] as const satisfies readonly { readonly id: ProbeSphereId; readonly label: string }[];
