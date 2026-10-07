/**
 * Whether an entry's Attribution line in the licence record asks for a set
 * acknowledgement as well as a citation: it says so in those words, or quotes
 * a text that opens "This research has made use of" or "This publication
 * makes use of".
 */
export function asksAcknowledgement(attribution: string): boolean {
  return /acknowledge?ment|makes? use of|made use of/i.test(attribution);
}
