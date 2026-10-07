/** Whether an Attribution line of the licence record asks for a set text as well as a citation: it says "acknowledgement", or quotes one ("This publication makes use of"). */
export function asksAcknowledgement(attribution: string): boolean {
  return /acknowledge?ment|makes? use of|made use of/i.test(attribution);
}
