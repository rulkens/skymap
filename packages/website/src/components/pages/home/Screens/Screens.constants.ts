// The case behind a flat device: as many slices as the phone's, one pixel apart. The phone draws its own.
export const SLICES = 9;

// The devices, smallest first: each stands on the row's floor line, rising in size to the dome.
export const KINDS = ['phone', 'tablet', 'desktop', 'dome'] as const;
