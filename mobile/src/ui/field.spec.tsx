import { fireEvent } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { defaultTheme } from '@/design/theme';
import { touch } from '@/design/tokens';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Field } from './field';

/**
 * A text input with its label above it, not inside it.
 *
 * Floating labels and placeholder-as-label both lose the label at the moment
 * the person is typing, which is the moment they most need it. This app asks
 * parents for national ID numbers and teachers for marks against a named
 * assessment, so the label stays put.
 */

const boxOf = (screen: { getByPlaceholderText: (t: string) => never }) =>
  (screen.getByPlaceholderText('type here') as { parent: never }).parent;

beforeEach(resetHarness);

const field = (props: Record<string, unknown> = {}) => (
  <Field label="Email" placeholder="type here" {...props} />
);

describe('a field', () => {
  /**
   * The label is drawn above the box rather than inside it, which is what
   * keeps it readable while somebody is typing. That leaves the input itself
   * with no name unless it is given one, and an unnamed field announces
   * nothing at all to a screen reader.
   */
  it('carries its label for a screen reader as well as on screen', async () => {
    const screen = await renderScreen(field());

    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('announces the hint alongside it', async () => {
    const screen = await renderScreen(field({ hint: 'We will send a code' }));

    expect(
      screen.getByLabelText('Email').props.accessibilityHint,
    ).toBe('We will send a code');
  });

  it('announces the error instead once there is one', async () => {
    const screen = await renderScreen(
      field({ hint: 'A hint', error: 'That address is not valid' }),
    );

    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe(
      'That address is not valid',
    );
  });

  it('lets a caller name it something else', async () => {
    const screen = await renderScreen(
      field({ accessibilityLabel: 'Your school email' }),
    );

    expect(screen.getByLabelText('Your school email')).toBeTruthy();
  });

  it('keeps its label above the box where it stays readable', async () => {
    const screen = await renderScreen(field());

    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('type here')).toBeTruthy();
  });

  it('takes what is typed into it', async () => {
    const onChangeText = jest.fn();
    const screen = await renderScreen(field({ onChangeText }));

    await fireEvent.changeText(
      screen.getByPlaceholderText('type here'),
      'aline.uwase@markova.edu',
    );

    expect(onChangeText).toHaveBeenCalledWith('aline.uwase@markova.edu');
  });

  it('is tall enough to hit', async () => {
    const screen = await renderScreen(field());

    expect(styleOf(boxOf(screen)).minHeight).toBeGreaterThanOrEqual(touch.min);
  });

  it('carries a hint under it when it needs one', async () => {
    const screen = await renderScreen(
      field({ hint: 'We will send a code to this address' }),
    );

    expect(
      screen.getByText('We will send a code to this address'),
    ).toBeTruthy();
  });

  /**
   * The error replaces the hint rather than appearing under it, so the field
   * never changes height and the form never jumps while being filled.
   */
  it('replaces the hint with the error rather than stacking them', async () => {
    const screen = await renderScreen(
      field({ hint: 'A hint', error: 'That address is not valid' }),
    );

    expect(screen.getByText('That address is not valid')).toBeTruthy();
    expect(screen.queryByText('A hint')).toBeNull();
  });

  it('outlines the box in red when something is wrong with it', async () => {
    const screen = await renderScreen(field({ error: 'Required' }));

    expect(styleOf(boxOf(screen)).borderColor).toBe(
      defaultTheme.status.critical.solid,
    );
  });

  it('lets the error be copied, since somebody may have to quote it', async () => {
    const screen = await renderScreen(field({ error: 'Required' }));

    expect(screen.getByText('Required').props.selectable).toBe(true);
  });

  it('outlines the box in the school colour while it is being used', async () => {
    const screen = await renderScreen(field());

    await fireEvent(screen.getByPlaceholderText('type here'), 'focus');

    expect(styleOf(boxOf(screen)).borderColor).toBe(defaultTheme.brand.solid);
  });

  it('goes quiet again when the person moves on', async () => {
    const screen = await renderScreen(field());

    await fireEvent(screen.getByPlaceholderText('type here'), 'focus');
    await fireEvent(screen.getByPlaceholderText('type here'), 'blur');

    expect(styleOf(boxOf(screen)).borderColor).toBe(defaultTheme.line.border);
  });

  it('still tells the screen what it was told to do on focus', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const screen = await renderScreen(field({ onFocus, onBlur }));

    await fireEvent(screen.getByPlaceholderText('type here'), 'focus');
    await fireEvent(screen.getByPlaceholderText('type here'), 'blur');

    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });
});

/**
 * Baymard's checkout work found that marking only the required fields leaves
 * every unmarked field ambiguous. Here that matters most on the add-a-person
 * form, where a national ID genuinely is optional for a thirteen year old and
 * genuinely is not for a member of staff.
 */
describe('saying which fields have to be filled', () => {
  it('marks a required one, and says so rather than only drawing it', async () => {
    const screen = await renderScreen(field({ required: true }));

    expect(screen.getByLabelText('required')).toBeTruthy();
  });

  it('says optional out loud on the ones that are', async () => {
    const screen = await renderScreen(field({ optional: true }));

    expect(screen.getByText('optional')).toBeTruthy();
  });

  it('says neither when the form does not distinguish', async () => {
    const screen = await renderScreen(field());

    expect(screen.queryByText('optional')).toBeNull();
    expect(screen.queryByLabelText('required')).toBeNull();
  });
});

describe('a password', () => {
  it('is hidden to begin with', async () => {
    const screen = await renderScreen(field({ secureTextEntry: true }));

    expect(
      screen.getByPlaceholderText('type here').props.secureTextEntry,
    ).toBe(true);
  });

  it('can be shown, because a typo in a hidden password is invisible', async () => {
    const screen = await renderScreen(field({ secureTextEntry: true }));

    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));

    expect(
      screen.getByPlaceholderText('type here').props.secureTextEntry,
    ).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });

  it('can be hidden again', async () => {
    const screen = await renderScreen(field({ secureTextEntry: true }));

    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));

    expect(
      screen.getByPlaceholderText('type here').props.secureTextEntry,
    ).toBe(true);
  });

  it('has no reveal button on a field that is not one', async () => {
    const screen = await renderScreen(field());

    expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
  });
});

describe('the shapes a field takes', () => {
  // A student ID read off a card is read character by character, so it gets
  // the mono face and wider tracking rather than the reading face.
  it('sets a machine code in mono', async () => {
    const screen = await renderScreen(field({ mono: true }));

    expect(
      styleOf(screen.getByPlaceholderText('type here')).fontFamily,
    ).toContain('JetBrains');
  });

  it('sets ordinary text in the reading face', async () => {
    const screen = await renderScreen(field());

    expect(
      styleOf(screen.getByPlaceholderText('type here')).fontFamily,
    ).toContain('Poppins');
  });

  it('grows for a note, and starts the text at the top of the box', async () => {
    const screen = await renderScreen(field({ minHeight: 120 }));

    expect(styleOf(boxOf(screen)).minHeight).toBe(120);
    expect(
      styleOf(screen.getByPlaceholderText('type here')).textAlignVertical,
    ).toBe('top');
  });

  it('can carry a unit or a scan button on its right', async () => {
    const screen = await renderScreen(
      field({ accessory: <RNText>/20</RNText> }),
    );

    expect(screen.getByText('/20')).toBeTruthy();
  });
});
