import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { buildTheme } from '@/design/theme';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import School from './school';

/**
 * The screen that decides what every other screen looks like.
 *
 * The colour field is the interesting one. Whatever a school types becomes
 * the brand across the whole app, and the app derives a readable set of roles
 * from it rather than using it raw. So this shows the derivation live: you
 * see the actual button colour you are going to get, not the swatch you
 * typed, and if the two differ the screen says why.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const config = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/school-config': {
      school_name: 'Groupe Scolaire Kigali',
      school_motto: 'Learn and lead',
      primary_color: '#1B4F72',
      ...over,
    },
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<School />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  config();
});

describe('what a school is called', () => {
  it('fills the form in with what is already set', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('School name').props.value).toBe(
        'Groupe Scolaire Kigali',
      ),
    );
    expect(screen.getByLabelText('Motto').props.value).toBe('Learn and lead');
    expect(screenTitle()).toBe('School settings');
  });

  it('cannot be saved until something has actually changed', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save' }).props.accessibilityState
          .disabled,
      ).toBe(true),
    );

    await fireEvent.changeText(
      screen.getByLabelText('School name'),
      'Groupe Scolaire Kicukiro',
    );

    expect(
      screen.getByRole('button', { name: 'Save' }).props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  it('saves only what was changed', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByLabelText('Motto').props.value).toBe('Learn and lead'),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Motto'),
      'Learn, lead, serve',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith('/school-config', {
        key: 'school_motto',
        value: 'Learn, lead, serve',
      }),
    );
    expect(http.put).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledWith(
      'Saved. The app is wearing it now.',
    );
  });

  it('says so when the save will not go through', async () => {
    givenApiFails('/school-config', new Error('offline'));
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByLabelText('School name')).toBeTruthy(),
    );

    await fireEvent.changeText(screen.getByLabelText('School name'), 'Another');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not save that'),
    );
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/school-config': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screenTitle()).toBe('School');
  });
});

/**
 * A school that types a bright yellow gets a noticeably darker button, and
 * without an explanation that reads like a bug.
 */
describe('the colour, and what it actually becomes', () => {
  it('shows the button colour a school will really get', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('What you will actually get')).toBeTruthy(),
    );

    expect(styleOf(screen.getByText('A button').parent!).backgroundColor).toBe(
      buildTheme('#1B4F72').brand.solid,
    );
    expect(styleOf(screen.getByText('Selected').parent!).backgroundColor).toBe(
      buildTheme('#1B4F72').brand.tint,
    );
  });

  it('says a colour that carries white is used exactly as typed', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Your colour carries a white label as it is, so it is used exactly as typed.',
        ),
      ).toBeTruthy(),
    );
  });

  // The measured number is what turns "that looks wrong" into "that is why".
  it('says why a pale colour was darkened, and by how much it fell short', async () => {
    config({ primary_color: '#F1C40F' });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Darkened from what you typed/)).toBeTruthy(),
    );
    expect(screen.getByText(/a button label needs 75/)).toBeTruthy();
  });

  it('keeps the hue a school chose while doing it', async () => {
    const { hexToOklch } = require('@/design/color');
    config({ primary_color: '#F1C40F' });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Darkened from what you typed/)).toBeTruthy(),
    );
    const shown = styleOf(screen.getByText('A button').parent!)
      .backgroundColor as unknown as string;
    expect(
      Math.abs(hexToOklch(shown).h - hexToOklch('#F1C40F').h),
    ).toBeLessThan(3);
  });

  it('refuses something that is not a colour at all', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Brand colour')).toBeTruthy());

    await fireEvent.changeText(
      screen.getByLabelText('Brand colour'),
      'ubururu',
    );

    await waitFor(() =>
      expect(screen.getByText('That is not a hex colour')).toBeTruthy(),
    );
    expect(screen.queryByText('What you will actually get')).toBeNull();
  });

  it('takes one typed without its hash, and saves it with one', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Brand colour')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Brand colour'), '8E44AD');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith('/school-config', {
        key: 'primary_color',
        value: '#8E44AD',
      }),
    );
  });

  it('says nothing about a preview for an empty field', async () => {
    config({ primary_color: '' });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Brand colour')).toBeTruthy());
    expect(screen.queryByText('That is not a hex colour')).toBeNull();
    expect(screen.queryByText('What you will actually get')).toBeNull();
  });
});

/**
 * The logo, stamp and signature print on a report card, so they are uploaded
 * where somebody can see them against that layout.
 */
describe('the marks that print on a report card', () => {
  it('says which of them a school has set', async () => {
    config({ stamp_url: 'https://school.rw/stamp.png' });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Uploaded')).toBeTruthy());
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0);
  });

  it('shows the logo itself rather than only saying it exists', async () => {
    config({ logo_url: 'https://school.rw/logo.png' });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Logo')).toBeTruthy());
    expect(screen.getAllByText('Not set')).toHaveLength(2);
  });

  it('says where they are uploaded, and why there', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Uploading the logo, stamp and signature stays on the web dashboard, where you can see them against the report card layout they print on.',
        ),
      ).toBeTruthy(),
    );
  });
});
