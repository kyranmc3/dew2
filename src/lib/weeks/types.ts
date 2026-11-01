export type Answer = "no" | "maybe" | "yes";
export type Booking = "booked" | "waitlist" | null;

export type WeekEvent = {
  id: string;
  date: string;
  name: string;
  source: string | null;
  type: string | null;
  format: string | null;
  place: string;
  start: string | null; // "7:00 PM"
  end: string | null;
  price: number | null;
  avail: string | null;
  img: string | null;
  link: string | null;
  desc: string | null;
};

export type WeekInfo = {
  start: string; // the Monday
  days: string[];
  isReady: boolean;
  dayNotes: Record<string, string>;
};

// One user's choices for one week.
export type WeekState = {
  answers: Record<string, Answer>;
  ranking: string[];
  plan: Record<string, { booking: Booking }>;
  saved: boolean;
  skipped: boolean;
};

export const EMPTY_STATE: WeekState = { answers: {}, ranking: [], plan: {}, saved: false, skipped: false };
