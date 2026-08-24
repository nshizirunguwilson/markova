import { act, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { renderApiHook } from '@/test/harness';

import * as useApi from './useApi';

/**
 * Every write the app makes.
 *
 * Two things matter for each one and neither is visible at build time: which
 * method and URL it uses, and which caches it clears afterwards. Getting the
 * second wrong is the bug people describe as "I saved it but it did not
 * change", which is far harder to report than an outright failure.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

type Case = {
  hook: () => { mutateAsync: (v: never) => Promise<unknown> };
  send: unknown;
  method: 'post' | 'put' | 'delete';
  url: string;
  body?: unknown;
  /** Set where everything the write needs is already in the URL. */
  noBody?: true;
  /** The caches this write has to clear, or the screen shows stale data. */
  refreshes?: string[];
};

const ID = 'a0000000-0000-4000-8000-000000000001';

const cases: Record<string, Case> = {
  'taking a whole register at once': {
    hook: useApi.useBulkAttendance,
    send: {
      classSectionId: ID,
      date: '2026-08-24',
      type: 'DAILY',
      records: [{ studentId: 'student-1', status: 'PRESENT' }],
    },
    method: 'post',
    url: '/attendance/bulk',
    refreshes: ['class-attendance', 'attendance-summary'],
  },
  'a card tapped on the reader': {
    hook: useApi.useNfcScan,
    send: { nfcCardId: '1111 2222', classSectionId: ID },
    method: 'post',
    url: '/attendance/nfc-scan',
    refreshes: ['class-attendance'],
  },
  'giving a child a card': {
    hook: useApi.useRegisterNfcCard,
    send: { studentId: ID, nfcCardId: '1111 2222' },
    method: 'post',
    url: '/attendance/register-nfc',
    refreshes: ['class-students-nfc'],
  },
  'telling parents about repeated absence': {
    hook: useApi.useNotifyChronic,
    send: { studentIds: [ID] },
    method: 'post',
    url: '/attendance/chronic/notify',
  },

  'entering a column of marks': {
    hook: useApi.useBatchMarks,
    send: {
      subjectId: ID,
      classSectionId: ID,
      termId: 'term-1',
      assessmentTypeId: 'cat-1',
      marks: [{ studentId: 'student-1', score: 17 }],
    },
    method: 'post',
    url: '/marks/batch',
    refreshes: ['student-marks'],
  },
  'working out a term’s results': {
    hook: useApi.useCalculateTermResults,
    send: { classSectionId: ID, termId: 'term-1' },
    method: 'post',
    url: '/marks/term-results/calculate',
    refreshes: ['class-term-results'],
  },
  'publishing them': {
    hook: useApi.usePublishTermResults,
    send: { classSectionId: ID, termId: 'term-1' },
    method: 'post',
    url: '/marks/term-results/publish',
    refreshes: ['class-term-results'],
  },
  'writing a comment on a report': {
    hook: useApi.useSaveResultComment,
    send: { id: ID, teacherComment: 'A steady term' },
    method: 'put',
    url: `/marks/term-results/${ID}/comment`,
    body: { teacherComment: 'A steady term' },
    refreshes: ['class-term-results'],
  },

  'logging an incident': {
    hook: useApi.useCreateIncident,
    send: {
      studentId: ID,
      termId: 'term-1',
      date: '2026-08-24',
      description: 'Late three times',
      pointsDeducted: 3,
      actionTaken: 'VERBAL_WARNING',
    },
    method: 'post',
    url: '/discipline/incidents',
    refreshes: ['student-discipline'],
  },
  'a parent acknowledging one': {
    hook: useApi.useAcknowledgeIncident,
    send: ID,
    method: 'post',
    url: '/discipline/acknowledge',
    body: { incidentId: ID },
    refreshes: ['student-discipline'],
  },
  'appealing one': {
    hook: useApi.useCreateAppeal,
    send: { incidentId: ID, reason: 'He was at the clinic' },
    method: 'post',
    url: '/discipline/appeals',
    refreshes: ['student-discipline'],
  },
  'answering an appeal': {
    hook: useApi.useReviewAppeal,
    send: { id: ID, status: 'APPROVED', reviewNotes: 'Confirmed' },
    method: 'put',
    url: `/discipline/appeals/${ID}/review`,
    body: { status: 'APPROVED', reviewNotes: 'Confirmed' },
    refreshes: ['pending-appeals'],
  },
  'recognising something a child did well': {
    hook: useApi.useAwardMerit,
    send: { studentId: ID, category: 'HONESTY', points: 5 },
    method: 'post',
    url: '/discipline/merits',
    refreshes: ['merits', 'standing'],
  },

  'setting homework': {
    hook: useApi.useCreateHomework,
    send: {
      subjectId: ID,
      classSectionId: ID,
      termId: 'term-1',
      title: 'Essay',
      dueDate: '2026-09-01',
    },
    method: 'post',
    url: '/homework',
    refreshes: ['homework-list'],
  },
  'marking a piece of work': {
    hook: useApi.useGradeSubmission,
    send: { submissionId: ID, marks: 18 },
    method: 'put',
    url: `/homework/submissions/${ID}/grade`,
    body: { marks: 18 },
    refreshes: ['homework-list'],
  },

  'reading a notification': {
    hook: useApi.useMarkNotificationRead,
    send: ID,
    method: 'put',
    url: `/notifications/${ID}/read`,
    noBody: true,
    refreshes: ['notifications'],
  },
  'clearing the lot': {
    hook: useApi.useMarkAllNotificationsRead,
    send: undefined,
    method: 'put',
    url: '/notifications/read-all',
    refreshes: ['notifications'],
  },

  'lending a book': {
    hook: useApi.useCheckoutBook,
    send: { bookId: ID, userId: 'user-1' },
    method: 'post',
    url: '/library/checkout',
    refreshes: ['library-books', 'library-active-loans'],
  },
  'taking one back': {
    hook: useApi.useReturnBook,
    send: ID,
    method: 'post',
    url: '/library/return',
    body: { loanId: ID },
    refreshes: ['library-books', 'library-active-loans', 'library-overdue-loans'],
  },
  'writing one off as lost': {
    hook: useApi.useReportLostBook,
    send: ID,
    method: 'post',
    url: '/library/lost',
    body: { loanId: ID },
    refreshes: ['loans'],
  },
  'reminding people to bring books back': {
    hook: useApi.useSendLoanReminders,
    send: undefined,
    method: 'post',
    url: '/library/reminders/send',
  },

  'raising a support ticket': {
    hook: useApi.useCreateTicket,
    send: { subject: 'Cannot sign in', description: 'The code never arrives' },
    method: 'post',
    url: '/help/tickets',
    refreshes: ['my-tickets'],
  },

  'removing somebody from the school': {
    hook: useApi.useDeactivateUser,
    send: ID,
    method: 'delete',
    url: `/users/${ID}`,
    refreshes: ['people'],
  },

  'closing a term': {
    hook: useApi.useCloseTerm,
    send: { id: ID },
    method: 'post',
    url: `/academic/terms/${ID}/close`,
    noBody: true,
    refreshes: ['terms', 'current-term'],
  },

  'taking a card back': {
    hook: useApi.useRevokeIdCard,
    send: ID,
    method: 'post',
    url: '/reports/id-cards/revoke',
    body: { studentId: ID },
    refreshes: ['id-card-registry'],
  },
  'producing a letter for a family': {
    hook: useApi.useGenerateDocument,
    send: { studentId: ID, documentType: 'TRANSFER' },
    method: 'post',
    url: '/reports/document',
  },

  'moving a year group up': {
    hook: useApi.useCommitPromotion,
    send: { academicYearId: 'year-1', decisions: [] },
    method: 'post',
    url: '/academic/promote/commit',
    refreshes: ['promotion-preview'],
  },

  'starting a conversation': {
    hook: useApi.useStartConversation,
    send: { type: 'DIRECT', participantIds: ['user-2'] },
    method: 'post',
    url: '/messaging/conversations',
    refreshes: ['conversations'],
  },

  'changing a school setting': {
    hook: useApi.useSaveSchoolConfig,
    send: { key: 'primary_color', value: '#8E44AD' },
    method: 'put',
    url: '/school-config',
    // The branding cache too, or the app keeps the old colour until restart.
    refreshes: ['school-config', 'branding'],
  },
  'changing a password': {
    hook: useApi.useChangePassword,
    send: { currentPassword: 'old', newPassword: 'new' },
    method: 'post',
    url: '/auth/change-password',
  },

  'a card scanned at the counter': {
    hook: useApi.useLookupAccount,
    send: 'STD-2025-0417',
    method: 'post',
    url: '/pocket-money/lookup',
    // The API validates with forbidNonWhitelisted, so any other field name is
    // a 400 on every single scan.
    body: { identifier: 'STD-2025-0417' },
  },

  'a parent answering a permission slip': {
    hook: useApi.useRecordConsent,
    send: { activityId: ID, studentId: 'student-1', consent: 'GIVEN' },
    method: 'post',
    url: `/activities/${ID}/consent`,
    body: { studentId: 'student-1', consent: 'GIVEN' },
    refreshes: ['activities-student', 'activities-upcoming'],
  },

  'writing up a visit to the sick bay': {
    hook: useApi.useCreateVisit,
    send: { studentId: ID, complaint: 'Headache since assembly' },
    method: 'post',
    url: '/clinic/visits',
    refreshes: ['clinic-visits', 'clinic-summary'],
  },
  'sending a child back to class': {
    hook: useApi.useDischarge,
    send: ID,
    method: 'post',
    url: `/clinic/visits/${ID}/discharge`,
    noBody: true,
    refreshes: ['clinic-visits'],
  },
  'noting that a parent was told': {
    hook: useApi.useMarkParentNotified,
    send: ID,
    method: 'post',
    url: `/clinic/visits/${ID}/parent-notified`,
    noBody: true,
    refreshes: ['clinic-visits'],
  },
  'giving a dose': {
    hook: useApi.useGiveMedicine,
    send: { studentId: ID, medicine: 'Paracetamol', dose: '500mg' },
    method: 'post',
    url: '/clinic/medication',
    refreshes: ['clinic-visits'],
  },
};

beforeEach(resetApi);

describe.each(Object.entries(cases))('%s', (_name, testCase) => {
  it('goes to the right endpoint with what it was given', async () => {
    givenApi({ [testCase.url]: { written: true } });
    const { run } = renderApiHook(testCase.hook);
    const { result } = await run();

    await act(async () => {
      await result.current.mutateAsync(testCase.send as never);
    });

    const call = http[testCase.method].mock.calls[0];
    expect(call[0]).toBe(testCase.url);
    if (testCase.noBody) {
      expect(call[1]).toBeUndefined();
    } else if (testCase.body !== undefined) {
      expect(call[1]).toEqual(testCase.body);
    } else if (testCase.method !== 'delete' && testCase.send !== undefined) {
      expect(call[1]).toEqual(testCase.send);
    }
  });

  it('lets a refusal reach the screen', async () => {
    givenApiFails(testCase.url);
    const { run } = renderApiHook(testCase.hook);
    const { result } = await run();

    await act(async () => {
      await expect(
        result.current.mutateAsync(testCase.send as never),
      ).rejects.toBeTruthy();
    });
  });
});

/**
 * The half nobody notices until a screen shows the old answer. Each of these
 * writes has to clear the reads that its own change invalidates.
 */
describe.each(Object.entries(cases).filter(([, c]) => c.refreshes))(
  'after %s',
  (_name, testCase) => {
    it('clears the reads it just made stale', async () => {
      givenApi({ [testCase.url]: { written: true } });
      const { client, run } = renderApiHook(testCase.hook);
      const invalidate = jest.spyOn(client, 'invalidateQueries');
      const { result } = await run();

      await act(async () => {
        await result.current.mutateAsync(testCase.send as never);
      });

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledTimes(testCase.refreshes!.length),
      );
      const cleared = invalidate.mock.calls.map(
        ([arg]) => (arg as { queryKey: string[] }).queryKey[0],
      );
      expect(cleared.sort()).toEqual([...testCase.refreshes!].sort());
    });

    it('clears nothing when the write failed', async () => {
      givenApiFails(testCase.url);
      const { client, run } = renderApiHook(testCase.hook);
      const invalidate = jest.spyOn(client, 'invalidateQueries');
      const { result } = await run();

      await act(async () => {
        await result.current
          .mutateAsync(testCase.send as never)
          .catch(() => undefined);
      });

      expect(invalidate).not.toHaveBeenCalled();
    });
  },
);
