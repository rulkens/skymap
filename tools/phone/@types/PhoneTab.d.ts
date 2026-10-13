export type PhoneTab = {
  readonly targetId: string;
  readonly sessionId: string;
  readonly fresh: boolean; // a blank tab made because there was none to reuse
};
