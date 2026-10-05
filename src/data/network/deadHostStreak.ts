/**
 * Consecutive failed connections before `createDeadHostSet` retires a host.
 *
 * Three, not one: a single timeout is ordinary under load (hips2fits
 * legitimately takes 5-15 s), and the streak resets on any answer, so this
 * only ever trips on a host that is genuinely not responding. The cost of
 * being wrong is asymmetric — too low retires a working fallback for the
 * session, too high just wastes a few more 30 s deadlines.
 */
export const DEAD_HOST_STREAK = 3;
