import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import IdCards from './id-cards';

/**
 * Who has a card and who does not.
 *
 * Issuing is the easy half and the screen leads with the hard half: the list
 * of students without one, because that is the list somebody is working
 * through. Students who already have a card are behind a toggle, since they
 * are only looked at when one needs revoking.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const entry = (over: Record<string, unknown> = {}) => ({
  studentId: 'student-1',
  studentName: 'Aline Uwase',
  studentIdNumber: 'STD-2025-0417',
  nfcCardId: null,
  ...over,
});

const registry = (rows: unknown[], over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/reports/id-cards/registry': rows,
    '/reports/id-cards/issue': { issued: 1 },
    '/reports/id-cards/issue-bulk': { issued: 30 },
    '/reports/id-cards/revoke': { revoked: true },
    ...over,
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<IdCards />);
};

const showIssued = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await waitFor(() => expect(screen.getByText(/^Show \d/)).toBeTruthy());
  await fireEvent.press(screen.getByText(/^Show \d/));
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  registry([entry()]);
});

// The hard half leads: the list somebody is working through.
describe('who is still waiting', () => {
  it('leads with them, named and numbered', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Without a card')).toBeTruthy());
    expect(screen.getByText('Aline Uwase')).toBeTruthy();
    expect(screen.getByText('STD-2025-0417')).toBeTruthy();
    expect(screenTitle()).toBe('ID cards');
  });

  it('counts both sides', async () => {
    registry([entry(), entry({ studentId: 'student-2', nfcCardId: 'ABCD' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Have a card')).toBeTruthy());
    expect(screen.getByText('Still waiting')).toBeTruthy();
  });

  it('issues the whole class in one go, saying how many', async () => {
    registry([entry(), entry({ studentId: 'student-2', studentName: 'Eric' })]);
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Issue 2 cards for this class' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Issue 2 cards for this class' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/reports/id-cards/issue-bulk', {
        classSectionId: 'section-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Cards issued');
  });

  it('says one card properly', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Issue 1 card for this class' }),
      ).toBeTruthy(),
    );
  });

  it('says so when the bulk issue will not go through', async () => {
    givenApiFails('/reports/id-cards/issue-bulk', new Error('offline'));
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Issue 1 card for this class' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Issue 1 card for this class' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not issue those'),
    );
  });

  it('issues one card from the row itself', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Issue')).toBeTruthy());

    await fireEvent.press(screen.getByText('Issue'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/reports/id-cards/issue', {
        studentId: 'student-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Card issued');
  });

  it('reads a row named under either field the API uses', async () => {
    registry([entry({ studentName: undefined, name: 'Eric Habimana' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Eric Habimana')).toBeTruthy());
  });

  it('names an unnamed row something rather than nothing', async () => {
    registry([entry({ studentName: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
  });

  it('says so when the whole class already has one', async () => {
    registry([entry({ nfcCardId: 'ABCD' })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Everybody in this class has a card.'),
      ).toBeTruthy(),
    );
  });
});

/**
 * Only looked at when one needs revoking, so they stay behind a toggle.
 */
describe('who already has one', () => {
  beforeEach(() => registry([entry({ nfcCardId: 'ABCD-EFGH' })]));

  it('is folded away, with a count on the toggle', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Show 1')).toBeTruthy());
    expect(screen.queryByText('ABCD-EFGH')).toBeNull();
  });

  it('opens on the toggle, showing the card each one holds', async () => {
    const screen = await open();

    await showIssued(screen);

    await waitFor(() => expect(screen.getByText('ABCD-EFGH')).toBeTruthy());
    expect(screen.getByText('Hide')).toBeTruthy();
  });

  it('folds away again', async () => {
    const screen = await open();
    await showIssued(screen);
    await waitFor(() => expect(screen.getByText('Hide')).toBeTruthy());

    await fireEvent.press(screen.getByText('Hide'));

    await waitFor(() => expect(screen.queryByText('ABCD-EFGH')).toBeNull());
  });
});

/**
 * A revoked card stops opening the gate that afternoon, so it asks first.
 */
describe('revoking one', () => {
  beforeEach(() => registry([entry({ nfcCardId: 'ABCD-EFGH' })]));

  it('asks before it does anything', async () => {
    const screen = await open();
    await showIssued(screen);
    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy());

    await fireEvent.press(screen.getByText('Revoke'));

    await waitFor(() =>
      expect(screen.getByText('Really revoke')).toBeTruthy(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('does it once confirmed', async () => {
    const screen = await open();
    await showIssued(screen);
    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy());
    await fireEvent.press(screen.getByText('Revoke'));
    await waitFor(() => expect(screen.getByText('Really revoke')).toBeTruthy());

    await fireEvent.press(screen.getByText('Really revoke'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/reports/id-cards/revoke', {
        studentId: 'student-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Card revoked');
  });

  it('goes back to asking once it has been done', async () => {
    const screen = await open();
    await showIssued(screen);
    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy());
    await fireEvent.press(screen.getByText('Revoke'));
    await waitFor(() => expect(screen.getByText('Really revoke')).toBeTruthy());

    await fireEvent.press(screen.getByText('Really revoke'));

    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy());
  });
});

describe('the rest of the screen', () => {
  it('reads the registry for whichever class is picked', async () => {
    registry([entry()], {
      '/academic/sections': [
        { id: 'section-1', name: 'Senior 3 A' },
        { id: 'section-2', name: 'Senior 4 B' },
      ],
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/reports/id-cards/registry', {
        params: { classSectionId: 'section-2' },
      }),
    );
  });

  it('reads a registry sent as a paged answer as readily as a list', async () => {
    registry({ students: [entry()] } as never);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  it('offers the way to bind a physical card', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Bind a physical card' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Bind a physical card' }),
    );

    expect(router.push).toHaveBeenCalledWith('/(app)/nfc-register');
  });

  it('says so when a class has nobody in it', async () => {
    registry([]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No students')).toBeTruthy());
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/reports/id-cards/registry': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});
