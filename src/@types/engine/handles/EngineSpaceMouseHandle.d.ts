/**
 * EngineSpaceMouseHandle — WebHID SpaceMouse driver controls.
 *
 * Nested under `engine.input` so future input devices (keyboard, gamepad)
 * get a parallel home: `engine.input.keyboard.*`, `engine.input.gamepad.*`.
 */
export type EngineSpaceMouseHandle = {
  /** Prompt the WebHID device picker and open a paired SpaceMouse. */
  connect: () => Promise<boolean>;
  /** Close the currently-open SpaceMouse, if any.  Idempotent. */
  disconnect: () => void;
  /** Whether a SpaceMouse is currently open and feeding input reports. */
  isConnected: () => boolean;
  /** Set the SpaceMouse global sensitivity multiplier. */
  setSensitivity: (value: number) => void;
};
