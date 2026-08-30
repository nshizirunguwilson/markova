/**
 * What a count badge says.
 *
 * Past ninety-nine the exact number stops carrying information and starts
 * breaking the row it sits in: nobody reads "247 unread" as anything more
 * precise than "a lot", and the badge grows wide enough to push the label it
 * belongs to off the end. So it caps.
 *
 * One function because there are two badges, and a rule applied in two places
 * is a rule that will be applied differently in two places.
 */
export const BADGE_CAP = 99;

export function badgeCount(n: number | null | undefined): string {
  const count = Math.max(0, Math.floor(n ?? 0));
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(count);
}

/**
 * What a screen reader says instead.
 *
 * "99+" read aloud is "ninety nine plus", which is not a sentence. And a
 * badge is only ever announced beside the thing it counts, so the label has
 * to say what is being counted rather than repeat the number alone.
 */
export function badgeLabel(
  n: number | null | undefined,
  one: string,
  many = `${one}s`,
): string {
  const count = Math.max(0, Math.floor(n ?? 0));
  if (count > BADGE_CAP) return `More than ${BADGE_CAP} ${many}`;
  return `${count} ${count === 1 ? one : many}`;
}
