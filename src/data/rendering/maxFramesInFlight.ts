/**
 * MAX_FRAMES_IN_FLIGHT — how many submitted frames the GPU may still be working
 * on before `renderScheduler` holds the next one back. Uncapped, a scene over the
 * vsync budget queued about 7 frames and input lag went 9 → 69 ms (measured
 * 2026-11-10, `milky-way` pose). 2 is a starting value, not a measured optimum:
 * 1 gives the least lag but may idle the GPU while the main thread encodes.
 */

export const MAX_FRAMES_IN_FLIGHT = 2;
