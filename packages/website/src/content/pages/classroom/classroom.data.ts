import { fact } from '../../../data/fact';

/** A fact's short form where it has one, else its text. */
export const says = (id: string): string => fact(id).short ?? fact(id).text;
