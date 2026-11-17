/**
 * SCENE_SETTLE_TIMEOUT_MS — the longest a tour's cold-load gate waits for the
 * scene to settle before playing on regardless. A tile that never lands (a
 * dropped request, a failing host) must cost a half-built frame, never a hung
 * tour. 8 s covers the park scan plus its terrain on a slow connection.
 */
export const SCENE_SETTLE_TIMEOUT_MS = 8000;
