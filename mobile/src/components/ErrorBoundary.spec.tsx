import { Text as RNText } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import { errorReporter } from '@/lib/error-reporting';
import { defaultTheme } from '@/design/theme';
import { renderScreen, resetHarness } from '@/test/harness';

import { ErrorBoundary } from './ErrorBoundary';

/**
 * The last line of defence.
 *
 * It deliberately reads no context. If a provider is what crashed, anything
 * that consumes a provider crashes with it, and an error screen that throws
 * is worse than no error screen at all.
 */

jest.mock('@/lib/error-reporting', () => ({
  errorReporter: { captureException: jest.fn() },
}));

function Boom({ message = 'the marks screen fell over' }: { message?: string }) {
  throw new Error(message);
}

let noise: jest.SpyInstance;

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  // React prints the caught error itself; that is not the test's business.
  noise = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => noise.mockRestore());

describe('while nothing is wrong', () => {
  it('stays out of the way', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <RNText>Attendance</RNText>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Attendance')).toBeTruthy();
  });
});

describe('when a screen falls over', () => {
  it('says so without blaming the person reading it', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something broke')).toBeTruthy();
    expect(screen.getByText(/Not your fault/)).toBeTruthy();
  });

  it('tells somebody, rather than only telling the screen', async () => {
    await renderScreen(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(errorReporter.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'the marks screen fell over' }),
      expect.objectContaining({
        extra: expect.objectContaining({ componentStack: expect.anything() }),
      }),
    );
  });

  /**
   * The person looking at this is usually about to describe it to somebody
   * else, so the technical line is kept and can be copied.
   */
  it('keeps the technical line, and lets it be copied', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const detail = screen.getByText('the marks screen fell over');

    expect(detail.props.selectable).toBe(true);
  });

  it('shows something even for an error that carried no message', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <Boom message="" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something broke')).toBeTruthy();
    expect(screen.getByText(/Error/)).toBeTruthy();
  });

  it('offers a way back in once the thing that broke has recovered', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something broke')).toBeTruthy();

    await screen.rerender(
      <ErrorBoundary>
        <RNText>Attendance</RNText>
      </ErrorBoundary>,
    );
    await fireEvent(screen.getByLabelText('Try again'), 'touchEnd');

    expect(screen.getByText('Attendance')).toBeTruthy();
  });

  /**
   * Pressing it draws the children again rather than pretending the problem
   * has gone. Something that is still broken lands back here, which is
   * honest: there is nothing else this screen could do about it.
   */
  it('lands back here when the thing that broke is still broken', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await fireEvent(screen.getByLabelText('Try again'), 'touchEnd');

    expect(screen.getByText('Something broke')).toBeTruthy();
  });

  // If the theme provider is what crashed, reading the theme through context
  // would crash the error screen too.
  it('paints itself without asking any provider for anything', async () => {
    const screen = await renderScreen(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(JSON.stringify(screen.toJSON())).toContain(
      defaultTheme.brand.solid,
    );
  });
});
