/**
 * FlowMode — the two particle-integration styles the flow visualization offers.
 *
 * 'advect' moves a cloud of particles along the velocity field with wander and
 * a short trail; 'streamline' grows longer integrated curves. Each mode keeps
 * its OWN tuned parameter set (see FlowSlice) because the visually-correct
 * defaults differ sharply between them.
 */
export type FlowMode = 'advect' | 'streamline';
