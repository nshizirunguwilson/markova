/*
  How the school writes a date.

  A bare toLocaleDateString() takes the browser's own habit, so the same
  record read "12/11/2026" on one computer and "11/12/2026" on the next, and
  nobody could tell the 12th of November from the 11th of December. Every
  date on screen goes through here instead: the day first and the month in
  letters, which reads one way only.
*/
export const DATE_LOCALE = "en-GB";

type When = string | number | Date;

/** 12 Nov 2026 */
export function day(value: When): string {
  return new Date(value).toLocaleDateString(DATE_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** 12 Nov 2026, 14:05 */
export function dayAndTime(value: When): string {
  return new Date(value).toLocaleString(DATE_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
