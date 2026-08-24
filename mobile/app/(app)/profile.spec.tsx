import { fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import Profile from './profile';

/**
 * Your own record.
 *
 * A person can change three things about themselves here: their name, their
 * phone number and their photo. Everything else is shown but not editable,
 * because a role, a national ID and a staff code are facts the school owns,
 * and letting somebody edit their own role in an app is how you end up with a
 * school full of administrators.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const me = {
  ...teacher,
  phone: '+250788000123',
  photoUrl: null as string | null,
};

const account = () =>
  givenApi({
    '/auth/profile': me,
    '/users/user-1/photo': { uploaded: true },
  });

const open = async () => {
  signedInAs(me);
  return renderScreen(<Profile />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  account();
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
    granted: true,
  } as never);
  picker.launchImageLibraryAsync.mockResolvedValue({
    canceled: true,
  } as never);
});

describe('what a person can change about themselves', () => {
  it('is their name and their number, filled in already', async () => {
    const screen = await open();

    expect(screenTitle()).toBe('Your profile');
    expect(screen.getByLabelText('First name').props.value).toBe('Aline');
    expect(screen.getByLabelText('Last name').props.value).toBe('Uwase');
    expect(screen.getByLabelText('Phone').props.value).toBe('+250788000123');
  });

  it('says what the number is for', async () => {
    const screen = await open();

    expect(
      screen.getByText('The number the school reaches you on'),
    ).toBeTruthy();
  });

  // Nothing to save is not a state that needs a live button.
  it('cannot be saved until something has actually changed', async () => {
    const screen = await open();

    expect(
      screen.getByRole('button', { name: 'Save changes' }).props
        .accessibilityState.disabled,
    ).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('First name'), 'Alina');

    expect(
      screen.getByRole('button', { name: 'Save changes' }).props
        .accessibilityState.disabled,
    ).toBe(false);
  });

  it('saves the three of them and reloads who is signed in', async () => {
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Alina');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith('/auth/profile', {
        firstName: 'Alina',
        lastName: 'Uwase',
        phone: '+250788000123',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Saved');
  });

  it('sends no number at all when it has been cleared', async () => {
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText('Phone'), '');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith(
        '/auth/profile',
        expect.objectContaining({ phone: undefined }),
      ),
    );
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/auth/profile', {
      response: { data: { message: 'That number belongs to somebody else' } },
    });
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Alina');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That number belongs to somebody else',
      ),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/auth/profile', new Error('offline'));
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Alina');

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not save that'),
    );
  });
});

/**
 * "What is my staff code again" is a real question this answers, so the read
 * only facts stay on screen rather than being hidden.
 */
describe('what the school holds and a person cannot touch', () => {
  it('shows the role rather than offering to change it', async () => {
    const screen = await open();

    expect(screen.getByText('Teacher')).toBeTruthy();
    expect(screen.queryByLabelText('Role')).toBeNull();
  });

  it('shows the address the school has', async () => {
    const screen = await open();

    expect(screen.getByText('aline.uwase@markova.edu')).toBeTruthy();
  });

  it('leaves out an address where there is none', async () => {
    signedInAs({ ...me, email: undefined as never });

    const screen = await renderScreen(<Profile />);

    expect(screen.queryByText('Email')).toBeNull();
  });

  it('says whether the account is on', async () => {
    const screen = await open();

    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('says so for an account that has been turned off', async () => {
    signedInAs({ ...me, isActive: false });

    const screen = await renderScreen(<Profile />);

    expect(screen.getByText('Turned off')).toBeTruthy();
  });

  // Letting somebody edit their own role is how you end up with a school full
  // of administrators.
  it('says who to ask, and that the limit is deliberate', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'Ask the office if any of this is wrong. It cannot be changed from here on purpose.',
      ),
    ).toBeTruthy();
  });
});

describe('changing the photo', () => {
  it('asks the phone for permission first', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    await waitFor(() =>
      expect(picker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled(),
    );
  });

  it('says so plainly when the phone refuses', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
    } as never);
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Photo access is off for this app',
      ),
    );
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  // A profile photo is a circle, so it is cropped square before it goes.
  it('asks for a square crop, since the photo is drawn as a circle', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    await waitFor(() =>
      expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }),
      ),
    );
  });

  it('does nothing when the picker is dismissed', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    await waitFor(() =>
      expect(picker.launchImageLibraryAsync).toHaveBeenCalled(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('uploads the one that was picked', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///tmp/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' },
      ],
    } as never);
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/users/user-1/photo',
        expect.anything(),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Photo updated');
  });

  it('says so when the upload will not go through', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo.jpg' }],
    } as never);
    givenApiFails('/users/user-1/photo', new Error('too big'));
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not upload that photo'),
    );
  });
});
