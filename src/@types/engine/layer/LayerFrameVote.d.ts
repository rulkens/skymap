/**
 * LayerFrameVote — what a Layer's per-frame hook tells core about its own
 * content. Two questions with two different answers: one boolean conflated
 * them, and a Layer that animates forever then pinned the sky bakes.
 */

export type LayerFrameVote = {
  /** The render loop must keep ticking: this Layer's content is still changing. */
  readonly awake: boolean;
  /**
   * A sky cubemap bake taken now would capture half-arrived content. Implies
   * `awake` — core folds it in, so a Layer never has to say both — but not the
   * converse: content that animates forever (flow's ribbons) keeps the loop
   * awake without ever staling a bake, and a Layer in no capture roster can
   * never stale one at all.
   */
  readonly settling: boolean;
};
