/**
 * Minimal interface the SpaceMouse subsystem needs from a SpaceMouseInput.
 * Production passes the real `SpaceMouseInput` class; tests pass a
 * stub that lets them invoke `onAxes` / `onConnectionChange`
 * synchronously without touching WebHID.
 */
export type SpaceMouseInputLike = {
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
};
