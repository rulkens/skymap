import type { StarChunk } from './StarChunk';

/** A resident chunk's CPU copy by chunk ref, or null when its slot does not hold it. */
export type StarResidency = (chunkRef: number) => StarChunk | null;
