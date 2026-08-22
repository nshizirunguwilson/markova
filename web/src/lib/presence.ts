/**
 * How long ago someone was last online, in words.
 *
 * Relative time is a classic place for off-by-one bugs, and this one is read by
 * a parent deciding whether a teacher is likely to reply now or tomorrow. Lives
 * here rather than inside the messages page so it can be checked at each
 * boundary without standing up a chat screen.
 */
export function formatLastSeen(date: string | null | undefined, now: Date = new Date()): string {
  if (!date) return "offline";

  const seen = new Date(date);
  if (Number.isNaN(seen.getTime())) return "offline";

  const diffMin = Math.floor((now.getTime() - seen.getTime()) / 60000);

  // A clock that is slightly behind the server should not read as the future.
  if (diffMin < 1) return "last seen just now";
  if (diffMin < 60) return `last seen ${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `last seen ${diffHr}h ago`;

  return `last seen ${seen.toLocaleDateString()}`;
}

export type DeliveryStatus = "SENT" | "DELIVERED" | "READ";

/**
 * Which tick a message of this status gets. Named rather than returned as an
 * icon so it can be checked without rendering.
 */
export function deliveryTick(status: string | undefined): "one" | "two" | "two-read" {
  if (status === "READ") return "two-read";
  if (status === "DELIVERED") return "two";
  return "one";
}
