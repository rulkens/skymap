/**
 * spacecraftPresent — whether a body exists in the scene at `simDays`. Only
 * sampled craft can be absent: present once their track is loaded and the clock
 * has reached its first sample. Before that the snapshot parks the craft at
 * Earth's position so lookups stay total; this gate is what keeps it undrawn.
 */

import { SAMPLED_BODIES } from '../../data/missions/spacecraftBodies';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';

const SAMPLED_IDS = new Set(SAMPLED_BODIES.map((body) => body.id));

export function spacecraftPresent(id: string, simDays: number): boolean {
  if (!SAMPLED_IDS.has(id)) return true;
  const track = trajectoryRegistry.get(id);
  return track !== undefined && simDays >= track.tDays[0]!;
}
