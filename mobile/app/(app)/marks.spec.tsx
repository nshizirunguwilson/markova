import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  meterFill,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import MarksCompletion from './marks';

/**
 * What is still missing.
 *
 * This answers the only question worth asking before a term closes: whose
 * marks are we waiting on. It shows the gap rather than the progress, so an
 * incomplete row is what stands out, not a wall of green ticks for work
 * already done. Fully entered subjects collapse to a single line at the
 * bottom: they are confirmation, not information.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const row = (over: Record<string, unknown> = {}) => ({
  subjectId: 'subject-1',
  subjectName: 'Mathematics',
  assessmentTypeId: 'cat-1',
  assessmentTypeName: 'CAT 1',
  entered: 12,
  expected: 30,
  ...over,
});

const school = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/marks/completion': [],
    ...over,
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<MarksCompletion />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  school();
});

describe('what the screen is for', () => {
  it('says so in the header', async () => {
    await open();

    expect(screenTitle()).toBe('Marks completion');
  });

  it('reads the gaps for the first class and the current term', async () => {
    await open();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/marks/completion', {
        params: { classSectionId: 'section-1', termId: 'term-1' },
      }),
    );
  });

  it('switches to another class', async () => {
    school({
      '/academic/sections': [
        { id: 'section-1', name: 'Senior 3 A' },
        { id: 'section-2', name: 'Senior 4 B' },
      ],
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/marks/completion', {
        params: { classSectionId: 'section-2', termId: 'term-1' },
      }),
    );
  });

  it('shows a placeholder while it reads', async () => {
    school({ '/marks/completion': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });

  it('says so when a class has nothing to track yet', async () => {
    const screen = await open();

    // The screen shows the empty state, then a skeleton while it reads for
    // the class it just picked, then the empty state again. Waiting on the
    // body rather than the title lands on the settled one.
    await waitFor(() =>
      expect(
        screen.getByText(
          'Once subjects and assessments exist for this class, the gaps show up here.',
        ),
      ).toBeTruthy(),
    );
  });
});

/**
 * The gap, not the progress: an incomplete row is what has to stand out.
 */
describe('what is still open', () => {
  it('names the subject and the assessment still waiting', async () => {
    school({ '/marks/completion': [row()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Waiting on')).toBeTruthy());
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('CAT 1')).toBeTruthy();
    expect(screen.getByText('12 of 30')).toBeTruthy();
  });

  // Nothing entered at all is a different problem from half entered: one is
  // a teacher who has not started, the other is one who was interrupted.
  it('reads a subject nobody has started as the more serious one', async () => {
    school({ '/marks/completion': [row({ entered: 0 })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('0 of 30')).toBeTruthy());
    expect(styleOf(screen.getByText('0 of 30')).color).toBe(
      defaultTheme.status.critical.text,
    );
  });

  it('reads a subject half done as a caution', async () => {
    school({ '/marks/completion': [row()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('12 of 30')).toBeTruthy());
    expect(styleOf(screen.getByText('12 of 30')).color).toBe(
      defaultTheme.status.caution.text,
    );
  });

  it('counts what is open and what is done', async () => {
    school({
      '/marks/completion': [
        row(),
        row({ assessmentTypeId: 'cat-2', entered: 30, expected: 30 }),
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Still open')).toBeTruthy());
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('counts a pair the API sent with neither figure', async () => {
    school({ '/marks/completion': [{ subjectId: 's1', subjectName: 'Maths' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('0%')).toBeTruthy());
  });

  it('shows the whole term as one bar', async () => {
    school({ '/marks/completion': [row()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Term 2')).toBeTruthy());
    expect(meterFill(screen).backgroundColor).toBe(defaultTheme.brand.solid);
  });

  /**
   * Completion is per term, so with no current term there is nothing to be
   * waiting on. Reading it anyway would answer for whichever term the API
   * picked, which is worse than saying nothing.
   */
  it('reads nothing at all until a school has a current term', async () => {
    resetApi();
    school({ '/academic/years': [] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing to track yet')).toBeTruthy(),
    );
    expect(http.get).not.toHaveBeenCalledWith(
      '/marks/completion',
      expect.anything(),
    );
  });
});

/**
 * Finished work is confirmation, not information, so it collapses to a line.
 */
describe('what is finished', () => {
  it('reads as healthy once nothing is open', async () => {
    school({ '/marks/completion': [row({ entered: 30, expected: 30 })] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Every subject and assessment for this class is fully entered.',
        ),
      ).toBeTruthy(),
    );
    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.positive.solid,
    );
  });

  it('collapses the finished pairs to a single line', async () => {
    school({
      '/marks/completion': [
        row(),
        row({ assessmentTypeId: 'cat-2', entered: 30, expected: 30 }),
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('1 subject and assessment pair already complete.'),
      ).toBeTruthy(),
    );
  });

  it('counts more than one properly', async () => {
    school({
      '/marks/completion': [
        row(),
        row({ assessmentTypeId: 'cat-2', entered: 30, expected: 30 }),
        row({ assessmentTypeId: 'cat-3', entered: 30, expected: 30 }),
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('2 subject and assessment pairs already complete.'),
      ).toBeTruthy(),
    );
  });

  it('says nothing about finished work when there is none', async () => {
    school({ '/marks/completion': [row()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Waiting on')).toBeTruthy());
    expect(screen.queryByText(/already complete/)).toBeNull();
  });

  // A pair with nothing expected is a subject nobody teaches yet, which is
  // neither open nor done.
  it('does not count a pair that expects nothing as finished', async () => {
    school({ '/marks/completion': [row({ entered: 0, expected: 0 })] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/fully entered/)).toBeTruthy(),
    );
    expect(screen.queryByText(/already complete/)).toBeNull();
  });
});
