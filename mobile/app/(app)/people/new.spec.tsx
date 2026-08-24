import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import NewPerson from './new';

/**
 * Adding one person.
 *
 * The form asks for the least it can and lets the server do the rest. A role
 * code, a temporary password and, for a student, an ID number are all
 * generated, so asking a human to invent them is asking for collisions.
 *
 * The fields that appear change with the role, because a librarian has no
 * class and a student has no staff number, and showing empty boxes that do
 * not apply is how a form teaches people to skip fields.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const school = () =>
  givenApi({
    '/academic/sections': [
      { id: 'section-1', name: 'Senior 3 A' },
      { id: 'section-2', name: 'Senior 4 B' },
    ],
    '/users': { id: 'user-9' },
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<NewPerson />);
};

const fillName = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await fireEvent.changeText(screen.getByLabelText('First name'), 'Aline');
  await fireEvent.changeText(screen.getByLabelText('Last name'), 'Uwase');
};

const submit = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  fireEvent.press(screen.getByRole('button', { name: 'Add them' }));

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  school();
});

describe('what the form asks for', () => {
  it('says what it is', async () => {
    await open();

    expect(screenTitle()).toBe('Add someone');
  });

  /**
   * The role code, the temporary password and the student number are all
   * generated, so asking a human to invent them is asking for collisions.
   */
  it('says out loud what it will not ask a human to invent', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'Their role code, temporary password and student number are generated automatically.',
      ),
    ).toBeTruthy();
  });

  it('offers every role a school has', async () => {
    const screen = await open();

    for (const role of ['Student', 'Teacher', 'Parent', 'Librarian', 'Admin']) {
      expect(screen.getByText(role)).toBeTruthy();
    }
  });

  // A student has a class; a librarian does not, and an empty box that does
  // not apply teaches people to skip fields.
  it('asks a student for a class and nobody else', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Which class')).toBeTruthy());

    await fireEvent.press(screen.getByText('Librarian'));

    await waitFor(() => expect(screen.queryByText('Which class')).toBeNull());
  });

  // Most parents on this system have a phone number and no email at all.
  it('tells whoever is adding a parent how parents actually sign in', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('Parent'));

    await waitFor(() =>
      expect(
        screen.getByText('Most parents use a phone number instead'),
      ).toBeTruthy(),
    );
  });

  it('marks the national ID as optional, and says who will not have one', async () => {
    const screen = await open();

    expect(screen.getByText('optional')).toBeTruthy();
    expect(
      screen.getByText(
        'Sixteen digits. Students under sixteen usually will not have one.',
      ),
    ).toBeTruthy();
  });
});

describe('what it refuses to send', () => {
  it('asks for a name', async () => {
    const screen = await open();

    await submit(screen);

    expect(screen.getAllByText('Needed')).toHaveLength(2);
    expect(http.post).not.toHaveBeenCalled();
  });

  /**
   * Somebody with neither an email nor a phone number cannot sign in at all,
   * which makes the record useless the moment it is created.
   */
  it('asks for a way in, since a record with none is useless', async () => {
    const screen = await open();
    await fillName(screen);

    await submit(screen);

    expect(
      screen.getByText('An email or a phone number is needed to sign in'),
    ).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('takes a phone number as that way in', async () => {
    const screen = await open();
    await fillName(screen);
    await fireEvent.press(screen.getByText('Parent'));
    await fireEvent.changeText(screen.getByLabelText('Phone'), '+250788100000');

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({ phone: '+250788100000', email: undefined }),
      ),
    );
  });

  it('asks a student for a class', async () => {
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );

    await submit(screen);

    expect(screen.getByText('A student needs a class')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  // A NIDA number is sixteen digits, and a short one is a typo rather than a
  // different kind of ID.
  it('refuses a national ID that is not sixteen digits', async () => {
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );
    await fireEvent.press(screen.getByText('Senior 3 A'));
    await fireEvent.changeText(screen.getByLabelText('National ID'), '12345');

    await submit(screen);

    expect(screen.getByText('A NIDA number is sixteen digits')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('accepts one written with spaces in it', async () => {
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );
    await fireEvent.press(screen.getByText('Senior 3 A'));
    await fireEvent.changeText(
      screen.getByLabelText('National ID'),
      '1200 4567 8901 2345',
    );

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({ nationalId: '1200456789012345' }),
      ),
    );
  });
});

describe('adding them', () => {
  it('sends the least it can, tidied up', async () => {
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      '  Aline.Uwase@Markova.edu ',
    );
    await fireEvent.press(screen.getByText('Senior 3 A'));

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/users', {
        role: 'STUDENT',
        firstName: 'Aline',
        lastName: 'Uwase',
        email: 'aline.uwase@markova.edu',
        phone: undefined,
        nationalId: undefined,
        classSectionId: 'section-1',
      }),
    );
  });

  it('sends no class for somebody who is not a student', async () => {
    const screen = await open();
    await fireEvent.press(screen.getByText('Teacher'));
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({ role: 'TEACHER', classSectionId: undefined }),
      ),
    );
  });

  it('says what happens next, and goes back to the list', async () => {
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );
    await fireEvent.press(screen.getByText('Senior 3 A'));

    await submit(screen);

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Aline added. They get a temporary password to change on first sign in.',
      ),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/users', {
      response: { data: { message: 'That email is already taken' } },
    });
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );
    await fireEvent.press(screen.getByText('Senior 3 A'));

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That email is already taken'),
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/users', new Error('offline'));
    const screen = await open();
    await fillName(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Email'),
      'a.uwase@markova.edu',
    );
    await fireEvent.press(screen.getByText('Senior 3 A'));

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not add them'),
    );
  });
});
