/**
 * What a notification is ABOUT, as opposed to how it was sent.
 *
 * `Notification.type` is the channel — SMS, EMAIL, PUSH — and the bell used to
 * route off it, which is why clicking a notification never went anywhere: no
 * channel name has ever contained the word "attendance". `relatedEntityType`
 * is the subject, and these are the values it may take. Written once and
 * shared so the two clients and every service that raises a notice agree on
 * the spelling; the web client maps each to the page for the reader's role.
 */
export const NotificationSubject = {
  ATTENDANCE: 'ATTENDANCE',
  MARKS: 'MARKS',
  TERM_RESULT: 'TERM_RESULT',
  REPORT_CARD: 'REPORT_CARD',
  HOMEWORK: 'HOMEWORK',
  DISCIPLINE: 'DISCIPLINE',
  MERIT: 'MERIT',
  BOOK_LOAN: 'BOOK_LOAN',
  MESSAGE: 'MESSAGE',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  ACTIVITY: 'ACTIVITY',
  CLINIC: 'CLINIC',
  POCKET_MONEY: 'POCKET_MONEY',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationSubject =
  (typeof NotificationSubject)[keyof typeof NotificationSubject];

export const NOTIFICATION_SUBJECTS = Object.values(NotificationSubject);

/**
 * Best guess at what an older notification was about.
 *
 * Every row written before `relatedEntityType` was filled in has nothing to
 * route on, and so does the demo seed. Rather than leaving those inert, the
 * title is matched against the words a school actually uses. Ordered most
 * specific first: "report card published" is a report card, not marks.
 */
const TITLE_HINTS: [RegExp, NotificationSubject][] = [
  [/report card/i, NotificationSubject.REPORT_CARD],
  [/transcript/i, NotificationSubject.REPORT_CARD],
  [/attendance|absent|absence|late arrival/i, NotificationSubject.ATTENDANCE],
  [/homework|assignment|graded/i, NotificationSubject.HOMEWORK],
  [/discipline|incident|appeal|suspension/i, NotificationSubject.DISCIPLINE],
  [/merit|good news|recognised/i, NotificationSubject.MERIT],
  [/librar|book|overdue|borrow/i, NotificationSubject.BOOK_LOAN],
  [/message/i, NotificationSubject.MESSAGE],
  [/announcement/i, NotificationSubject.ANNOUNCEMENT],
  [/activity|club|trip/i, NotificationSubject.ACTIVITY],
  [/clinic|health|sick bay/i, NotificationSubject.CLINIC],
  [/pocket money|allowance/i, NotificationSubject.POCKET_MONEY],
  [/marks|results|grade/i, NotificationSubject.MARKS],
];

/**
 * The subject of a notification: what it says it is about, or what its title
 * suggests. Null when neither answers, in which case the bell leaves it as a
 * plain notice rather than sending the reader somewhere arbitrary.
 */
export function notificationSubject(
  notification: {
    relatedEntityType?: string | null;
    title?: string | null;
  } | null,
): NotificationSubject | null {
  if (!notification) return null;

  const declared = notification.relatedEntityType?.trim().toUpperCase();
  if (declared) {
    const known = NOTIFICATION_SUBJECTS.find((s) => s === declared);
    if (known) return known;
  }

  const title = notification.title ?? '';
  for (const [pattern, subject] of TITLE_HINTS) {
    if (pattern.test(title)) return subject;
  }
  return null;
}
