export const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;
