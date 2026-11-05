/**
 * InlineSegment — one run of an exhibit's prose after `inlineSegments` has
 * split it on its markup. Tagged rather than parity-indexed so a caller
 * renders each run without `dangerouslySetInnerHTML` and without knowing the
 * split rule.
 */

export type InlineSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'em'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };
