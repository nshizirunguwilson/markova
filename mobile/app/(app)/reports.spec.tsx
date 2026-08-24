import { fireEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Reports from './reports';

/**
 * The moment the whole term waits behind.
 *
 * Three steps in order, and the screen refuses to let them happen out of
 * order: calculate, comment, publish. Publishing makes results visible to
 * every parent and student in the class at once, so it sits last, states how
 * many people it is about to notify, and is the only place in the app where a
 * primary button says what it will do rather than what it is called.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const result = (over: Record<string, unknown> = {}) => ({
  id: 'result-1',
  average: 72.4,
  letterGrade: 'B',
  rank: 4,
  isPublished: false,
  student: { user: { firstName: 'Aline', lastName: 'Uwase' } },
  ...over,
});

const term = (results: unknown[], over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [
      { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: false },
    ],
    '/marks/term-results/class': results,
    '/marks/term-results/calculate': { calculated: 30 },
    '/marks/term-results/publish': { published: 30 },
    '/marks/term-results/result-1/comment': { saved: true },
    ...over,
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Reports />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  term([]);
});

describe('where the class stands', () => {
  it('counts the results and averages them', async () => {
    term([result(), result({ id: 'result-2', average: 60 })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Results')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('66%')).toBeTruthy();
    expect(screenTitle()).toBe('Report cards');
  });

  it('says whether the class has been published', async () => {
    term([result()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Published')).toBeTruthy());
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('names the term, and says when it is closed for marks', async () => {
    term([], {
      '/academic/terms': [
        { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: true },
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Term 2, closed for marks')).toBeTruthy(),
    );
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/marks/term-results/class': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

// Nothing to comment on and nothing to publish until this has run.
describe('step one: working the results out', () => {
  it('is the only thing offered before anything exists', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Calculate for this class' }),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Nothing calculated yet')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Publish this class' }),
    ).toBeNull();
  });

  it('calculates for the class and the term', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Calculate for this class' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Calculate for this class' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/marks/term-results/calculate', {
        classSectionId: 'section-1',
        termId: 'term-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Results worked out');
  });

  it('offers a recalculation once results exist', async () => {
    term([result()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Recalculate' })).toBeTruthy(),
    );
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/marks/term-results/calculate', {
      response: { data: { message: 'Marks are still missing' } },
    });
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Calculate for this class' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Calculate for this class' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Marks are still missing'),
    );
  });

  /**
   * Recalculating a published term would silently change grades a parent has
   * already seen, so it is not offered at all.
   */
  it('goes away entirely once the class is published', async () => {
    term([result({ isPublished: true })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Already calculated and published. Recalculating a published term would change grades parents have already seen, so it is deliberately not offered here.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull();
  });
});

describe('step two: the head teacher’s word', () => {
  beforeEach(() => term([result(), result({ id: 'result-2' })]));

  it('says the comment goes on every card', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Applied to every card in this class. Leave it blank to skip.',
        ),
      ).toBeTruthy(),
    );
  });

  it('cannot be saved while it is blank', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save the comment' }),
      ).toBeTruthy(),
    );

    expect(
      screen.getByRole('button', { name: 'Save the comment' }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it('writes it onto every card in the class', async () => {
    givenApi({
      '/marks/term-results/result-1/comment': { saved: true },
      '/marks/term-results/result-2/comment': { saved: true },
    });
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Comment for the whole class'),
      ).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Comment for the whole class'),
      '  A strong term for this class  ',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save the comment' }),
    );

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        '/marks/term-results/result-1/comment',
        { headmasterComment: 'A strong term for this class' },
      ),
    );
    expect(http.put).toHaveBeenCalledWith(
      '/marks/term-results/result-2/comment',
      { headmasterComment: 'A strong term for this class' },
    );
    expect(notify.success).toHaveBeenCalledWith(
      'Comment added to every card',
    );
  });
});

/**
 * The point at which results become real. It says how many people it is about
 * to notify, and the button says what it will do.
 */
describe('step three: publishing', () => {
  beforeEach(() => term([result(), result({ id: 'result-2' })]));

  it('asks first, and says exactly who will see what', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Publish this class' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish this class' }),
    );

    expect(screen.getByText('Publish 2 report cards?')).toBeTruthy();
    expect(
      screen.getByText(
        'Every parent and student in this class will be able to see their marks, their grade and their position immediately. This is the point at which results become real.',
      ),
    ).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  // The button says what it does, not what it is called.
  it('names the number on the button itself', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Publish this class' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish this class' }),
    );

    expect(
      screen.getByRole('button', { name: 'Publish 2 cards' }),
    ).toBeTruthy();
  });

  it('publishes once confirmed', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Publish this class' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish this class' }),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish 2 cards' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/marks/term-results/publish', {
        classSectionId: 'section-1',
        termId: 'term-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Published');
  });

  it('can be thought better of', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Publish this class' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish this class' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Not yet' }));

    await waitFor(() =>
      expect(screen.queryByText('Publish 2 report cards?')).toBeNull(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/marks/term-results/publish', {
      response: { data: { message: 'Comments are missing on 3 cards' } },
    });
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Publish this class' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish this class' }),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Publish 2 cards' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Comments are missing on 3 cards',
      ),
    );
  });

  it('says so plainly once it is done', async () => {
    term([result({ isPublished: true })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Published. Every parent and student in this class can see their card.',
        ),
      ).toBeTruthy(),
    );
  });
});

describe('the class itself', () => {
  it('lists each student with their average, grade and position', async () => {
    term([result()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('Position 4')).toBeTruthy();
    // One class average at the top, one on the row.
    expect(screen.getAllByText('72%')).toHaveLength(2);
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('copes with a result the API sent with no student on it', async () => {
    term([result({ student: undefined, rank: null, average: null, letterGrade: null })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});

// The PDF is server-rendered; this hands it over rather than redrawing it.
describe('printing and exporting', () => {
  beforeEach(() => term([result()]));

  it('opens the whole class as one document', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open the class as one PDF' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Open the class as one PDF' }),
    );

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/reports/term/class?classSectionId=section-1&termId=term-1',
    );
  });

  it('downloads the lot as an archive', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Download everything as a ZIP' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Download everything as a ZIP' }),
    );

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/reports/export/all',
    );
  });
});
