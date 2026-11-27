/** The union of fields `net` reads from the `Network.*`, `Runtime.*` and `Log.*` events it listens to. */
export type NetEventParams = {
  readonly requestId: string;
  readonly request: { readonly url: string };
  readonly response: { readonly status: number; readonly mimeType: string };
  readonly encodedDataLength: number;
  readonly errorText: string;
  readonly type: string;
  readonly args: readonly { readonly value?: unknown; readonly description?: string }[];
  readonly entry: { readonly level: string; readonly source: string; readonly text: string };
  readonly exceptionDetails: {
    readonly text: string;
    readonly exception?: { readonly description?: string };
  };
};
