import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { defaultTheme } from '@/design/theme';
import { touch } from '@/design/tokens';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Button } from './button';

/**
 * Four kinds and no fifth. Size is a floor rather than a target, because this
 * gets pressed by somebody standing up in a corridor holding a register.
 */

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  (Haptics.impactAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('pressing a button', () => {
  it('does what it says', async () => {
    const onPress = jest.fn();
    const screen = await renderScreen(<Button label="Save" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).toHaveBeenCalled();
  });

  it('does nothing while it is disabled', async () => {
    const onPress = jest.fn();
    const screen = await renderScreen(
      <Button label="Save" onPress={onPress} disabled />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  // A second tap while the first is still saving is how a mark gets entered
  // twice or a book gets issued twice.
  it('does nothing while it is already working', async () => {
    const onPress = jest.fn();
    const screen = await renderScreen(
      <Button label="Save" onPress={onPress} loading />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('taps back on an iPhone', async () => {
    const screen = await renderScreen(<Button label="Save" onPress={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light,
    );
  });

  // A stepper pressed twenty times in a row would buzz twenty times.
  it('stays quiet when it is pressed repeatedly', async () => {
    const screen = await renderScreen(
      <Button label="Add one" onPress={jest.fn()} silent />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Add one' }));

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  /**
   * A phone with no haptic engine, or one that refuses. The press still has to
   * go through: a button that swallows a save because the buzz failed is far
   * worse than a button that does not buzz.
   */
  it('presses on regardless of a haptic that failed', async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('no engine'));
    const onPress = jest.fn();
    const screen = await renderScreen(<Button label="Save" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).toHaveBeenCalled();
  });
});

describe('what a button looks like', () => {
  it('clears the touch minimum with room to spare', async () => {
    const screen = await renderScreen(<Button label="Save" onPress={jest.fn()} />);

    expect(
      styleOf(screen.getByRole('button', { name: 'Save' })).minHeight,
    ).toBeGreaterThanOrEqual(touch.min);
  });

  it('wears the school colour when it is the point of the screen', async () => {
    const screen = await renderScreen(
      <Button label="Save" onPress={jest.fn()} kind="primary" />,
    );

    expect(
      styleOf(screen.getByRole('button', { name: 'Save' })).backgroundColor,
    ).toBe(defaultTheme.brand.solid);
  });

  it('is an outline when it is only an alternative', async () => {
    const screen = await renderScreen(<Button label="Cancel" onPress={jest.fn()} />);
    const style = styleOf(screen.getByRole('button', { name: 'Cancel' }));

    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(defaultTheme.line.border);
  });

  it('is just a target when it is neither', async () => {
    const screen = await renderScreen(
      <Button label="Forgot password" onPress={jest.fn()} kind="quiet" />,
    );
    const style = styleOf(screen.getByRole('button', { name: 'Forgot password' }));

    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderWidth).toBe(0);
  });

  // Removing something a person cannot get back is not the same colour as
  // saving something, whatever the school's brand happens to be.
  it('is red when it removes something for good', async () => {
    const screen = await renderScreen(
      <Button label="Delete" onPress={jest.fn()} kind="destructive" />,
    );

    expect(
      styleOf(screen.getByRole('button', { name: 'Delete' })).backgroundColor,
    ).toBe(defaultTheme.status.critical.solid);
  });

  it('fades when it cannot be pressed', async () => {
    const screen = await renderScreen(
      <Button label="Save" onPress={jest.fn()} disabled />,
    );

    expect(styleOf(screen.getByRole('button', { name: 'Save' })).opacity).toBe(
      0.4,
    );
  });

  /**
   * Setting alignSelf on every button means a parent can never centre one,
   * which is exactly what went wrong with the forgot password link.
   */
  it('only claims the width when it was asked to', async () => {
    const inline = await renderScreen(<Button label="A" onPress={jest.fn()} />);
    expect(styleOf(inline.getByRole('button', { name: 'A' })).alignSelf).toBeUndefined();

    const footer = await renderScreen(<Button label="B" onPress={jest.fn()} block />);
    expect(styleOf(footer.getByRole('button', { name: 'B' })).alignSelf).toBe(
      'stretch',
    );
  });
});

describe('what a button says', () => {
  it('carries its label for a screen reader', async () => {
    const screen = await renderScreen(<Button label="Save" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('says out loud that it cannot be pressed', async () => {
    const screen = await renderScreen(
      <Button label="Save" onPress={jest.fn()} disabled />,
    );

    expect(
      screen.getByRole('button', { name: 'Save' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('says out loud that it is working', async () => {
    const screen = await renderScreen(
      <Button label="Save" onPress={jest.fn()} loading />,
    );

    expect(
      screen.getByRole('button', { name: 'Save' }).props.accessibilityState,
    ).toMatchObject({ busy: true });
  });

  // The label is what a screen reader announces, so it stays on the element
  // even while the spinner has replaced it visually.
  it('keeps its name while the spinner is up', async () => {
    const screen = await renderScreen(
      <Button label="Saving" onPress={jest.fn()} loading />,
    );

    expect(screen.getByRole('button', { name: 'Saving' })).toBeTruthy();
    expect(screen.queryByText('Saving')).toBeNull();
  });

  it('shows an icon beside the label when it is given one', async () => {
    const { Text } = require('react-native');
    const screen = await renderScreen(
      <Button label="Scan" onPress={jest.fn()} icon={<Text>icon</Text>} />,
    );

    expect(screen.getByText('icon')).toBeTruthy();
    expect(screen.getByText('Scan')).toBeTruthy();
  });
});
