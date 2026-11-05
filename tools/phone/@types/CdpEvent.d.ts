export type CdpEvent = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly sessionId: string | undefined;
};
