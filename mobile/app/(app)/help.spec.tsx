import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Help from './help';

/**
 * Help, and asking for help.
 *
 * These were two screens, help and support, for one job. Somebody with a
 * problem does not know in advance whether it is a question with an answer or
 * a fault that needs reporting, and making them choose a screen first is
 * making them do the triage.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const faq = (over: Record<string, unknown> = {}) => ({
  id: 'faq-1',
  title: 'How do I reset my password?',
  content: 'Use the "I forgot my password" link on the sign in screen.',
  ...over,
});

const ticket = (over: Record<string, unknown> = {}) => ({
  id: 'ticket-1',
  title: 'Cannot see my marks',
  status: 'OPEN',
  createdAt: '2026-08-20T09:00:00.000Z',
  ...over,
});

const office = (faqs: unknown[] = [], tickets: unknown[] = []) =>
  givenApi({
    '/help/faqs': faqs,
    '/help/tickets/mine': tickets,
    '/help/tickets': { id: 'ticket-9' },
  });

const open = async () => {
  signedInAs(parent);
  return renderScreen(<Help />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  office();
});

describe('one screen for one job', () => {
  it('opens on the answers, and offers the questions beside them', async () => {
    const screen = await open();

    expect(screenTitle()).toBe('Help');
    expect(screen.getByText('Answers')).toBeTruthy();
    expect(
      screen.getByLabelText('What are you stuck on?'),
    ).toBeTruthy();
  });

  it('counts what somebody has already asked, on the tab itself', async () => {
    office([], [ticket(), ticket({ id: 'ticket-2' })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Your questions 2')).toBeTruthy(),
    );
  });

  it('says just "your questions" when there are none', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Your questions')).toBeTruthy(),
    );
  });
});

describe('the answers', () => {
  it('lists them and counts them', async () => {
    office([faq()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1 answer')).toBeTruthy());
    expect(screen.getByText('How do I reset my password?')).toBeTruthy();
  });

  it('says two answers properly', async () => {
    office([faq(), faq({ id: 'faq-2', title: 'Where is my report card?' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2 answers')).toBeTruthy());
  });

  // A list of open answers is a wall of text; one at a time is readable.
  it('keeps the answer folded away until it is asked for', async () => {
    office([faq()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('How do I reset my password?')).toBeTruthy(),
    );

    expect(
      screen.queryByText(
        'Use the "I forgot my password" link on the sign in screen.',
      ),
    ).toBeNull();

    await fireEvent.press(screen.getByText('How do I reset my password?'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Use the "I forgot my password" link on the sign in screen.',
        ),
      ).toBeTruthy(),
    );
  });

  it('folds it away again', async () => {
    office([faq()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('How do I reset my password?')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('How do I reset my password?'));
    await waitFor(() => expect(screen.getByText(/forgot my password/)).toBeTruthy());

    await fireEvent.press(screen.getByText('How do I reset my password?'));

    await waitFor(() =>
      expect(
        screen.queryByText(
          'Use the "I forgot my password" link on the sign in screen.',
        ),
      ).toBeNull(),
    );
  });

  it('lets an answer be copied, since it may be passed on', async () => {
    office([faq()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('How do I reset my password?')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('How do I reset my password?'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Use the "I forgot my password" link on the sign in screen.',
        ).props.selectable,
      ).toBe(true),
    );
  });

  it('shows a placeholder while it searches', async () => {
    givenApi({ '/help/faqs': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('searching them', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for the typing to stop before asking', async () => {
    const screen = await open();
    const before = http.get.mock.calls.length;

    await fireEvent.changeText(
      screen.getByLabelText('What are you stuck on?'),
      'password',
    );
    expect(http.get.mock.calls.length).toBe(before);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/help/faqs',
        expect.objectContaining({
          params: expect.objectContaining({ search: 'password' }),
        }),
      ),
    );
  });

  it('says so when nothing answers what was typed', async () => {
    const screen = await open();

    await fireEvent.changeText(
      screen.getByLabelText('What are you stuck on?'),
      'zzz',
    );
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() =>
      expect(screen.getByText('No answer for that yet')).toBeTruthy(),
    );
  });

  /**
   * Somebody who searched and found nothing has already written the question.
   * Making them type it again is the triage this screen exists to avoid.
   */
  it('carries what was searched for into the question', async () => {
    const screen = await open();
    await fireEvent.changeText(
      screen.getByLabelText('What are you stuck on?'),
      'marks are missing',
    );
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await waitFor(() =>
      expect(screen.getByText('No answer for that yet')).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Ask a question' }),
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText('In one line, what is wrong?').props.value,
      ).toBe('marks are missing'),
    );
  });

  it('says nothing is published rather than blaming a search', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing published yet')).toBeTruthy(),
    );
  });
});

describe('asking the office', () => {
  const openForm = async () => {
    const screen = await open();
    await fireEvent.press(screen.getByText(/Your questions/));
    // The button sits above the list and again inside the empty state.
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Ask the office something' })
          .length,
      ).toBeGreaterThan(0),
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Ask the office something' })[0],
    );
    await waitFor(() =>
      expect(screen.getByLabelText('In one line, what is wrong?')).toBeTruthy(),
    );
    return screen;
  };

  it('asks what would help whoever picks it up', async () => {
    const screen = await openForm();

    expect(
      screen.getByText('What you were doing, and what happened instead'),
    ).toBeTruthy();
  });

  it('sends the title and the detail', async () => {
    const screen = await openForm();

    await fireEvent.changeText(
      screen.getByLabelText('In one line, what is wrong?'),
      'Marks are missing for Term 2',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Anything else that would help'),
      'I opened my child and the marks screen was empty',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send it' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/help/tickets', {
        title: 'Marks are missing for Term 2',
        description: 'I opened my child and the marks screen was empty',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Sent. The office can see it now.');
  });

  // "Help" is not something anybody can pick up.
  it('refuses a title too short for anybody to act on', async () => {
    const screen = await openForm();

    await fireEvent.changeText(
      screen.getByLabelText('In one line, what is wrong?'),
      'help',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send it' }));

    expect(notify.error).toHaveBeenCalledWith(
      'Give it a short title so somebody can pick it up',
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('closes the form and shows the list once it has gone', async () => {
    const screen = await openForm();
    await fireEvent.changeText(
      screen.getByLabelText('In one line, what is wrong?'),
      'Marks are missing',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Send it' }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText('In one line, what is wrong?'),
      ).toBeNull(),
    );
  });

  it('can be thought better of', async () => {
    const screen = await openForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText('In one line, what is wrong?'),
      ).toBeNull(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('says so when it will not send', async () => {
    givenApiFails('/help/tickets', new Error('offline'));
    const screen = await openForm();
    await fireEvent.changeText(
      screen.getByLabelText('In one line, what is wrong?'),
      'Marks are missing',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Send it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not send that'),
    );
  });
});

describe('what somebody has already asked', () => {
  it('lists each one with where it has got to', async () => {
    office([], [ticket()]);
    const screen = await open();

    await fireEvent.press(screen.getByText(/Your questions/));

    await waitFor(() =>
      expect(screen.getByText('Cannot see my marks')).toBeTruthy(),
    );
    expect(screen.getByText('Open')).toBeTruthy();
    expect(
      screen.getByText(new Date('2026-08-20T09:00:00.000Z').toLocaleDateString()),
    ).toBeTruthy();
  });

  it('says so when they have asked nothing yet', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText(/Your questions/));

    await waitFor(() =>
      expect(
        screen.getByText('You have not asked anything yet'),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Anything you send goes straight to the office, and you can follow it here.',
      ),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/help/tickets/mine': () => new Promise(() => {}) });
    const screen = await open();

    await fireEvent.press(screen.getByText(/Your questions/));

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});
