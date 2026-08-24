import { act, renderHook } from '@testing-library/react-native';

import { useDebounce } from './useDebounce';

/**
 * Holds a value still until it stops changing.
 *
 * Every search field in the app uses this. Without it, typing "Uwase" fires
 * five requests and the list flickers through five answers, which on a slow
 * connection means somebody watches their own typing arrive out of order.
 */

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('a search box being typed into', () => {
  it('starts with what it was given', async () => {
    const { result } = await renderHook(() => useDebounce('Uwase'));

    expect(result.current).toBe('Uwase');
  });

  it('says nothing while the typing is still going', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebounce(value),
      { initialProps: { value: 'U' } },
    );

    await rerender({ value: 'Uw' });
    await act(() => jest.advanceTimersByTime(100));
    await rerender({ value: 'Uwa' });
    await act(() => jest.advanceTimersByTime(100));

    expect(result.current).toBe('U');
  });

  it('settles once the typing stops', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebounce(value),
      { initialProps: { value: 'U' } },
    );

    await rerender({ value: 'Uwase' });
    await act(() => jest.advanceTimersByTime(300));

    expect(result.current).toBe('Uwase');
  });

  // An average typist never pauses for a third of a second mid word, which is
  // the whole reason the number is 300.
  it('waits three hundred milliseconds unless told otherwise', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebounce(value),
      { initialProps: { value: 'U' } },
    );

    await rerender({ value: 'Uwase' });
    await act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe('U');

    await act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('Uwase');
  });

  it('can be told to wait longer or less', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebounce(value, 50),
      { initialProps: { value: 'U' } },
    );

    await rerender({ value: 'Uwase' });
    await act(() => jest.advanceTimersByTime(50));

    expect(result.current).toBe('Uwase');
  });

  it('holds anything, not only text', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: { page: number } }) => useDebounce(value),
      { initialProps: { value: { page: 1 } } },
    );

    await rerender({ value: { page: 2 } });
    await act(() => jest.advanceTimersByTime(300));

    expect(result.current).toEqual({ page: 2 });
  });

  // A pending timer firing after the screen closed would set state on a gone
  // component.
  it('drops its pending timer when the screen closes', async () => {
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    const { rerender, unmount } = await renderHook(
      ({ value }: { value: string }) => useDebounce(value),
      { initialProps: { value: 'U' } },
    );

    await rerender({ value: 'Uwase' });
    await unmount();

    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
