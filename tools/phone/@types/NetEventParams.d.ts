/** The union of fields `net` reads from the `Network.*` and `Runtime.*` events it listens to. */
export type NetEventParams = {
  readonly requestId: string;
  readonly request: { readonly url: string };
  readonly response: { readonly status: number; readonly mimeType: string };
  readonly encodedDataLength: number;
  readonly errorText: string;
  readonly type: string;
  readonly args: readonly { readonly value?: unknown; readonly description?: string }[];
  readonly exceptionDetails: {
    readonly text: string;
    readonly exception?: { readonly description?: string };
  };
};
