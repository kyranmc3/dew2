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
  startTime: string | null; // "19:00:00", in New York
  endTime: string | null;
  price: number | null;
  avail: string | null;
  img: string | null;
  link: string | null;
  desc: string | null;
  removed: boolean; // no longer in Notion, and only shown while committed
  checkedAt: string | null; // last edited in Notion
};

export type WeekInfo = {
  start: string; // the Monday
  days: string[]; // the days this user sees
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
  days: string[] | null; // kept from when the week was settled, or null to follow Settings
};

export const EMPTY_STATE: WeekState = { answers: {}, ranking: [], plan: {}, saved: false, skipped: false, days: null };
