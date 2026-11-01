import type { WeekEvent } from "@/lib/weeks/types";

export const Tag = ({ kind, large, children }: { kind: string; large?: boolean; children: React.ReactNode }) => (
  <span className={`tag ${kind}${large ? " large" : ""}`}>{children}</span>
);

export const BookingTag = ({ booking, large }: { booking: string | null; large?: boolean }) =>
  booking === "booked" ? (
    <Tag kind="booked" large={large}>Booked</Tag>
  ) : booking === "waitlist" ? (
    <Tag kind="waitlist" large={large}>Waitlist</Tag>
  ) : (
    <Tag kind="notbooked" large={large}>Not booked</Tag>
  );

const AVAILABILITY: Record<string, [string, string]> = {
  "Sold Out": ["sold", "Sold out"],
  Waitlist: ["soft", "Waitlist only"],
  "Few Left": ["soft", "Few left"],
  "Not On Sale": ["soft", "Not on sale"],
  "Members Only": ["soft", "Members only"],
};

export function AvailabilityTag({ avail }: { avail: string | null }) {
  const found = avail ? AVAILABILITY[avail] : null;
  return found ? <Tag kind={found[0]}>{found[1]}</Tag> : null;
}

export function ExternalLink({ href, className = "link", children }: { href: string | null; className?: string; children: React.ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function Poster({ event, alt, className }: { event: WeekEvent; alt: string; className?: string }) {
  if (!event.img) return <div className={`no-poster${className ? ` ${className}` : ""}`} />;
  return <img className={className} src={event.img} alt={alt} loading="lazy" />;
}
