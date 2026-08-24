import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Subjects from './subjects';

/**
 * Subjects, grouped by scope.
 *
 * Scope is the thing that actually matters about a subject here, because it
 * decides which grading scale applies and how the term mark is weighted. An
 * O-Level elective is marked on a stricter scale than a core subject, and a
 * trade module carries a practical worth 30 per cent that no other subject
 * has. So the grouping is by scope rather than alphabetical.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const subject = (over: Record<string, unknown> = {}) => ({
  id: 'subject-1',
  name: 'Mathematics',
  scope: 'O_CORE',
  maxMarks: 100,
  isActive: true,
  ...over,
});

const taught = (subjects: unknown[]) =>
  givenApi({ '/academic/subjects': subjects });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Subjects />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  taught([]);
});

/**
 * What its scope costs is the one thing somebody checking this screen is
 * usually trying to confirm.
 */
describe('what each scope is worth', () => {
  it('opens on the core subjects and says how they are weighted', async () => {
    const screen = await open();

    expect(screenTitle()).toBe('Subjects');
    expect(
      screen.getByText('CAT 20, CAT 20, exam 60. Standard scale.'),
    ).toBeTruthy();
  });

  // The stricter scale is the difference between an A at 70 and an A at 80.
  it('says an elective is marked harder than a core subject', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('O-Level elective'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'CAT 20, CAT 20, exam 60. Stricter scale: an A needs 80.',
        ),
      ).toBeTruthy(),
    );
  });

  it('says a trade module carries a practical no other subject has', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('Trade modules'));

    await waitFor(() =>
      expect(
        screen.getByText('CAT 15, CAT 15, practical 30, exam 40.'),
      ).toBeTruthy(),
    );
  });

  it('covers every scope the grading code knows', async () => {
    const screen = await open();

    for (const scope of [
      'O-Level core',
      'O-Level elective',
      'A-Level general',
      'Trade modules',
    ]) {
      expect(screen.getByText(scope)).toBeTruthy();
    }
  });
});

describe('the subjects in a scope', () => {
  it('lists them and counts them', async () => {
    taught([subject(), subject({ id: 'subject-2', name: 'Physics' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2 subjects')).toBeTruthy());
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('Physics')).toBeTruthy();
  });

  it('says one subject properly', async () => {
    taught([subject()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1 subject')).toBeTruthy());
  });

  it('shows only the ones in the scope being looked at', async () => {
    taught([
      subject(),
      subject({ id: 'subject-2', name: 'Woodwork', scope: 'A_SPECIFIC' }),
    ]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());

    await fireEvent.press(screen.getByText('Trade modules'));

    await waitFor(() => expect(screen.getByText('Woodwork')).toBeTruthy());
    expect(screen.queryByText('Mathematics')).toBeNull();
  });

  it('names the trade and the year a module belongs to', async () => {
    taught([
      subject({
        scope: 'A_SPECIFIC',
        name: 'Carpentry practice',
        trade: { name: 'Carpentry' },
        classLevel: { name: 'Level 4' },
      }),
    ]);
    const screen = await open();
    await fireEvent.press(screen.getByText('Trade modules'));

    await waitFor(() =>
      expect(screen.getByText('Carpentry   ·   Level 4')).toBeTruthy(),
    );
  });

  /**
   * A subject marked out of something other than a hundred changes every
   * calculation that touches it, so it says so.
   */
  it('says when a subject is marked out of something unusual', async () => {
    taught([subject({ maxMarks: 40 })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('/40')).toBeTruthy());
  });

  it('says nothing where it is marked out of a hundred', async () => {
    taught([subject()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
    expect(screen.queryByText('/100')).toBeNull();
  });

  it('marks a subject that has been switched off', async () => {
    taught([subject({ isActive: false })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Off')).toBeTruthy());
  });

  it('says so when a scope has nothing in it', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing in this scope')).toBeTruthy(),
    );
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/academic/subjects': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says where subjects are actually created', async () => {
    const screen = await open();

    expect(
      screen.getByText('Adding and editing subjects stays on the web dashboard.'),
    ).toBeTruthy();
  });
});
