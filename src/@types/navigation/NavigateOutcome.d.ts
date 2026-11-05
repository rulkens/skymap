/** NavigateOutcome — whether `navigateSaga` reached the link's subject. */
export type NavigateOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unknown-id' };
