/** What a ruler gesture tells the transport: a seek per press and move, and when the gesture starts and ends. */
export type RulerScrub = {
  readonly onSeek: (sec: number) => void;
  readonly onStart: () => void;
  /** Called on every release, cancel and lost capture: it must be safe to call twice. */
  readonly onEnd: () => void;
};
