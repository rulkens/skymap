/**
 * FocusId — a branded type alias that marks strings intended as durable focus
 * identifiers in tour clips and authoring surfaces.
 *
 * Branding at the type system level earns its keep only at the authoring boundary —
 * where raw strings from UI inputs need to be validated and stamped as safe before
 * flowing into the tour/clip graph. Because FocusId is assignable to string, the
 * runtime `resolveFocusId` function stays plain and simple: it works with ordinary
 * strings. The brand is a compile-time guard, not a runtime wrapper.
 *
 * This keeps the concern narrow: the brand says "the author proved this was a valid
 * identifier", not "we wrapped it in a class". The resolver never needs to unwrap.
 */

export type FocusId = string & { readonly __focusId: unique symbol };
