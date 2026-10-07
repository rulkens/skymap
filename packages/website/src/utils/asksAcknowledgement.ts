/**
 * Whether an entry's Attribution line in the licence record asks for a set
 * acknowledgement as well as a citation: it says so in those words, or quotes
 * a text that opens "This research has made use of".
 */
export function asksAcknowledgement(attribution: string): boolean {
  return /acknowledge?ment|made use of/i.test(attribution);
}
