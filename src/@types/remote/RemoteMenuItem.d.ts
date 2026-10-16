/** One button on the remote: the id the remote sends back, and the dome's own label for it. */
export type RemoteMenuItem<Id extends string> = { id: Id; label: string };
