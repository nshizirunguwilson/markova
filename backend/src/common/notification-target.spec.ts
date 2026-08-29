import {
  NOTIFICATION_SUBJECTS,
  NotificationSubject,
  notificationSubject,
} from './notification-target';

/**
 * What a notification is about.
 *
 * The bell used to decide where to send a reader by looking at
 * `Notification.type`, which is the channel - SMS, EMAIL or PUSH. No channel
 * name has ever contained the word "attendance", so every notification in the
 * system opened nothing at all when clicked.
 */
describe('the subject of a notification', () => {
  it('takes the declared subject when there is one', () => {
    expect(
      notificationSubject({ relatedEntityType: 'ATTENDANCE', title: 'x' }),
    ).toBe(NotificationSubject.ATTENDANCE);
  });

  // Services wrote 'attendance', 'BOOK_LOAN' and 'TERM_RESULT' in three
  // different casings before this was written down in one place.
  it('reads a subject written in any casing', () => {
    expect(notificationSubject({ relatedEntityType: 'attendance' })).toBe(
      NotificationSubject.ATTENDANCE,
    );
    expect(notificationSubject({ relatedEntityType: ' Book_Loan ' })).toBe(
      NotificationSubject.BOOK_LOAN,
    );
  });

  /**
   * Everything written before the column was filled in - and the whole demo
   * seed - carries no subject. Leaving those inert would mean the bell worked
   * only for notices raised after the fix.
   */
  it('falls back to what the title says', () => {
    expect(notificationSubject({ title: 'Attendance below 90%' })).toBe(
      NotificationSubject.ATTENDANCE,
    );
    expect(notificationSubject({ title: 'Six books are overdue' })).toBe(
      NotificationSubject.BOOK_LOAN,
    );
    expect(notificationSubject({ title: 'Homework Graded' })).toBe(
      NotificationSubject.HOMEWORK,
    );
  });

  // "Report card published" is a report card, not marks, and both words are
  // in the title - so the order the patterns are tried in matters.
  it('prefers the more specific reading of an ambiguous title', () => {
    expect(notificationSubject({ title: 'Report card published' })).toBe(
      NotificationSubject.REPORT_CARD,
    );
    expect(notificationSubject({ title: 'Term 2 marks are due' })).toBe(
      NotificationSubject.MARKS,
    );
  });

  it('prefers the declared subject over the title', () => {
    expect(
      notificationSubject({
        relatedEntityType: 'MESSAGE',
        title: 'Six books are overdue',
      }),
    ).toBe(NotificationSubject.MESSAGE);
  });

  // A subject nobody has taught the clients about would send a reader to a
  // page that does not exist.
  it('ignores a declared subject it does not know', () => {
    expect(
      notificationSubject({ relatedEntityType: 'SOMETHING_NEW', title: 'x' }),
    ).toBeNull();
  });

  it('answers nothing for a notice that gives no clue', () => {
    expect(notificationSubject({ title: 'System Ready' })).toBeNull();
    expect(notificationSubject({})).toBeNull();
    expect(notificationSubject(null)).toBeNull();
  });

  it('lists every subject it accepts', () => {
    expect(NOTIFICATION_SUBJECTS).toContain('DISCIPLINE');
    expect(new Set(NOTIFICATION_SUBJECTS).size).toBe(
      NOTIFICATION_SUBJECTS.length,
    );
  });
});
