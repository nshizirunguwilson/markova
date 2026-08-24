import { waitFor } from '@testing-library/react-native';

import { givenApi, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import ChildHomework from './homework';

/**
 * What has been set, and what was handed in.
 *
 * Split into what is still owed and what is finished, rather than one list
 * sorted by date, because those are two different questions and only the
 * first is urgent. Overdue work is separated again from work merely due, so a
 * parent can see at a glance whether they need to say something tonight.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

const piece = (over: Record<string, unknown> = {}) => ({
  id: 'hw-1',
  title: 'Chapter 4 exercises',
  dueDate: inDays(3),
  maxMarks: 20,
  subject: { name: 'Mathematics' },
  submission: null,
  ...over,
});

const set = (items: unknown[]) =>
  givenApi({ '/homework/student/student-1': items });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildHomework />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  set([]);
});

describe('the three piles', () => {
  it('names the child in the header', async () => {
    set([piece()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    expect(screenTitle()).toBe('Aline Uwase, homework');
  });

  /**
   * Overdue is separated from merely due, because only one of them means a
   * parent has to say something tonight.
   */
  it('puts what is late above what is merely due', async () => {
    set([
      piece({ id: 'hw-1', title: 'Late one', dueDate: inDays(-2) }),
      piece({ id: 'hw-2', title: 'Due one', dueDate: inDays(3) }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overdue')).toBeTruthy());
    expect(screen.getByText('Still to do')).toBeTruthy();
    expect(screen.getByText('Late one')).toBeTruthy();
    expect(screen.getByText('Due one')).toBeTruthy();
  });

  it('counts work already handed in as finished, however late it was', async () => {
    set([
      piece({
        id: 'hw-1',
        dueDate: inDays(-5),
        submission: { id: 'sub-1', isLate: true },
      }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Handed in')).toBeTruthy());
    expect(screen.queryByText('Overdue')).toBeNull();
  });

  it('leaves out a heading with nothing under it', async () => {
    set([piece()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Still to do')).toBeTruthy());
    expect(screen.queryByText('Overdue')).toBeNull();
    expect(screen.queryByText('Handed in')).toBeNull();
  });

  it('says the subject and the day it is due', async () => {
    const due = inDays(3);
    set([piece({ dueDate: due })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          `Mathematics   ·   due ${new Date(due).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}`,
        ),
      ).toBeTruthy(),
    );
  });

  it('copes with a piece the API sent with no subject', async () => {
    set([piece({ subject: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(/^Subject/)).toBeTruthy());
  });
});

describe('what came back', () => {
  it('shows the mark out of what it was worth', async () => {
    set([
      piece({ submission: { id: 'sub-1', marks: 17 }, maxMarks: 20 }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(/17/)).toBeTruthy());
    expect(screen.getByText(/\/ 20/)).toBeTruthy();
  });

  it('shows the mark alone where nothing said what it was out of', async () => {
    set([
      piece({ submission: { id: 'sub-1', marks: 17 }, maxMarks: undefined }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('17')).toBeTruthy());
  });

  it('says it is in but unmarked when a teacher has not got to it', async () => {
    set([piece({ submission: { id: 'sub-1', marks: null } })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getAllByText('Handed in')).toHaveLength(2),
    );
  });

  // Flagged, not punished. What the lateness costs is school policy.
  it('flags work that went in late', async () => {
    set([
      piece({ submission: { id: 'sub-1', isLate: true, marks: null } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Late')).toBeTruthy());
  });

  it('says nothing about lateness on work still to do', async () => {
    set([piece()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Still to do')).toBeTruthy());
    expect(screen.queryByText('Late')).toBeNull();
  });
});

describe('when there is nothing to show', () => {
  it('says so plainly', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Nothing set')).toBeTruthy());
    expect(
      screen.getByText('No homework has been assigned to this class yet.'),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/homework/student/student-1': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});
