import { fireEvent, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import ImportPeople from './import';

/**
 * Bringing a spreadsheet in.
 *
 * The template comes first, deliberately: importing against the wrong column
 * order is the single most common way this goes wrong, and downloading the
 * template is cheaper than explaining the format.
 *
 * Errors come back per row and are shown per row. A single "import failed"
 * against a file of four hundred students is useless, because the person then
 * has to find which line broke it themselves.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;
const picker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;

const picks = (over: Record<string, unknown> = {}) =>
  picker.getDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///tmp/students.csv',
        name: 'students.csv',
        mimeType: 'text/csv',
        size: 2048,
      },
    ],
    ...over,
  } as never);

const open = async () => {
  signedInAs(admin);
  return renderScreen(<ImportPeople />);
};

const choose = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  fireEvent.press(screen.getByRole('button', { name: 'Choose a CSV' }));

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  givenApi({ '/users/bulk-import': { created: 412, errors: [] } });
  picks();
});

describe('starting from the template', () => {
  it('says what the screen is', async () => {
    await open();

    expect(screenTitle()).toBe('Import');
  });

  /**
   * The wrong column order is the usual way this goes wrong, so the template
   * comes first and the screen says why the extra step is worth it.
   */
  it('offers the template before the file, and says why', async () => {
    const screen = await open();

    expect(
      screen.getByRole('button', { name: 'Download the template' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Importing against the wrong column order is the usual way this goes wrong, so it is worth the extra step.',
      ),
    ).toBeTruthy();
  });

  it('downloads the template for the role being imported', async () => {
    const screen = await open();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Download the template' }),
    );

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/users/import-template/STUDENT',
    );
  });

  it('follows the role when it is changed', async () => {
    const screen = await open();
    await fireEvent.press(screen.getByText('Teachers'));

    await fireEvent.press(
      screen.getByRole('button', { name: 'Download the template' }),
    );

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/users/import-template/TEACHER',
    );
  });

  it('covers the three kinds of person a school imports in bulk', async () => {
    const screen = await open();

    expect(screen.getByText('Students')).toBeTruthy();
    expect(screen.getByText('Teachers')).toBeTruthy();
    expect(screen.getByText('Parents')).toBeTruthy();
  });
});

describe('sending the file', () => {
  it('sends it with the role it belongs to', async () => {
    const screen = await open();

    await choose(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/users/bulk-import',
        expect.anything(),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      ),
    );
  });

  it('asks the phone only for spreadsheets', async () => {
    const screen = await open();

    await choose(screen);

    expect(picker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.arrayContaining(['text/csv']),
        copyToCacheDirectory: true,
      }),
    );
  });

  it('does nothing at all when the picker is dismissed', async () => {
    picker.getDocumentAsync.mockResolvedValue({ canceled: true } as never);
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(http.post).not.toHaveBeenCalled());
    expect(screen.queryByText('What happened')).toBeNull();
  });

  it('does nothing when the phone hands back no file', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [],
    } as never);
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(http.post).not.toHaveBeenCalled());
  });

  it('names a file the phone handed over without one', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/anon' }],
    } as never);
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(http.post).toHaveBeenCalled());
  });

  it('counts nothing when the school answered with nothing', async () => {
    givenApi({ '/users/bulk-import': {} });
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(screen.getByText('0 added')).toBeTruthy());
    expect(screen.getByText('Every row went in cleanly.')).toBeTruthy();
  });

  it('says how many went in', async () => {
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(screen.getByText('412 added')).toBeTruthy());
    expect(notify.success).toHaveBeenCalledWith('412 added');
    expect(screen.getByText('Every row went in cleanly.')).toBeTruthy();
  });

  it('reads the count under either name the API uses', async () => {
    givenApi({ '/users/bulk-import': { imported: 30, errors: [] } });
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(screen.getByText('30 added')).toBeTruthy());
  });
});

/**
 * A single "import failed" against a file of four hundred students is
 * useless, because the person then has to find which line broke it.
 */
describe('when some rows will not go in', () => {
  const withErrors = (errors: unknown[]) =>
    givenApi({ '/users/bulk-import': { created: 398, errors } });

  it('says which row, and what was wrong with it', async () => {
    withErrors([
      { row: 12, message: 'That email is already taken' },
      { row: 87, message: 'No class named Senior 9 Z' },
    ]);
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(screen.getByText('Row 12')).toBeTruthy());
    expect(screen.getByText('That email is already taken')).toBeTruthy();
    expect(screen.getByText('Row 87')).toBeTruthy();
    expect(screen.getByText('No class named Senior 9 Z')).toBeTruthy();
  });

  it('counts what went in beside what did not', async () => {
    withErrors([{ row: 12, message: 'That email is already taken' }]);
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(screen.getByText('398 added')).toBeTruthy());
    expect(screen.getByText('1 skipped')).toBeTruthy();
    expect(notify.error).toHaveBeenCalledWith('1 rows could not be added');
  });

  it('reads the failures under either name the API uses', async () => {
    givenApi({
      '/users/bulk-import': {
        created: 1,
        failed: [{ row: 3, message: 'Missing a last name' }],
      },
    });
    const screen = await open();

    await choose(screen);

    await waitFor(() => expect(screen.getByText('Row 3')).toBeTruthy());
  });

  it('says what the school said when the whole file was refused', async () => {
    givenApiFails('/users/bulk-import', {
      response: { data: { message: 'That is not a CSV' } },
    });
    const screen = await open();

    await choose(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That is not a CSV'),
    );
    expect(screen.queryByText('What happened')).toBeNull();
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/users/bulk-import', new Error('offline'));
    const screen = await open();

    await choose(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not read that file'),
    );
  });
});

describe('what happens to the people who came in', () => {
  it('says they all get a temporary password to change', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'Everybody imported gets a temporary password and is asked to change it the first time they sign in.',
      ),
    ).toBeTruthy();
  });
});
