import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import api from '@/lib/api';
import * as queue from '@/lib/offline-queue';

import { useOfflineQueue } from './useOfflineQueue';

/**
 * The screen's side of the offline register.
 *
 * The queue itself is tested next door. What this adds is the thing a teacher
 * actually notices: the badge showing how many registers are still waiting,
 * and the fact that they go on their own the moment the app comes back to the
 * foreground, without anybody having to remember.
 */

jest.mock('@/lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('@/lib/offline-queue');

const held = queue as jest.Mocked<typeof queue>;

const register = {
  classSectionId: 'section-1',
  date: '2026-08-24',
  type: 'DAILY' as const,
  records: [{ studentId: 'student-1', status: 'PRESENT' }],
};

let appStateHandler: (state: string) => void;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    handler: never,
  ) => {
    appStateHandler = handler;
    return { remove: jest.fn() };
  }) as never);
  held.getQueueSize.mockResolvedValue(0);
  held.processQueue.mockResolvedValue(0);
});

describe('the badge showing what is still waiting', () => {
  it('starts at nothing on an app with an empty queue', async () => {
    const { result } = await renderHook(() => useOfflineQueue());

    await waitFor(() => expect(result.current.queueSize).toBe(0));
  });

  it('shows what was left over from last time', async () => {
    held.getQueueSize.mockResolvedValue(3);

    const { result } = await renderHook(() => useOfflineQueue());

    await waitFor(() => expect(result.current.queueSize).toBe(3));
  });

  it('goes up when another register is taken with no signal', async () => {
    held.enqueueAttendance.mockResolvedValue({ id: 'q1' } as never);
    held.getQueueSize.mockResolvedValue(0);
    const { result } = await renderHook(() => useOfflineQueue());
    await waitFor(() => expect(result.current.queueSize).toBe(0));

    held.getQueueSize.mockResolvedValue(1);
    await act(async () => {
      await result.current.enqueue(register);
    });

    expect(held.enqueueAttendance).toHaveBeenCalledWith(register);
    await waitFor(() => expect(result.current.queueSize).toBe(1));
  });

  it('can be asked to recount', async () => {
    const { result } = await renderHook(() => useOfflineQueue());

    held.getQueueSize.mockResolvedValue(7);
    await act(async () => {
      await result.current.refreshSize();
    });

    expect(result.current.queueSize).toBe(7);
  });
});

describe('sending what was held', () => {
  it('does nothing when there is nothing waiting', async () => {
    const { result } = await renderHook(() => useOfflineQueue());
    await waitFor(() => expect(result.current.queueSize).toBe(0));

    await act(async () => {
      await expect(result.current.processNow()).resolves.toBe(0);
    });

    expect(held.processQueue).not.toHaveBeenCalled();
  });

  it('sends everything held and reports how many got through', async () => {
    held.getQueueSize.mockResolvedValue(2);
    held.processQueue.mockResolvedValue(2);
    const { result } = await renderHook(() => useOfflineQueue());

    await act(async () => {
      await expect(result.current.processNow()).resolves.toBe(2);
    });

    expect(held.processQueue).toHaveBeenCalledWith(api);
  });

  /**
   * A teacher who takes a register in a dead spot and then walks back into
   * signal should not have to remember to press anything. Coming back to the
   * app is the signal.
   */
  it('goes on its own when the app comes back to the foreground', async () => {
    held.getQueueSize.mockResolvedValue(1);
    await renderHook(() => useOfflineQueue());
    await waitFor(() => expect(held.processQueue).toHaveBeenCalled());
    held.processQueue.mockClear();

    await act(async () => {
      appStateHandler('background');
      appStateHandler('active');
    });

    await waitFor(() => expect(held.processQueue).toHaveBeenCalled());
  });

  it('does not go on a move between foreground states', async () => {
    held.getQueueSize.mockResolvedValue(1);
    await renderHook(() => useOfflineQueue());
    await waitFor(() => expect(held.processQueue).toHaveBeenCalled());
    held.processQueue.mockClear();

    await act(async () => {
      appStateHandler('active');
    });

    expect(held.processQueue).not.toHaveBeenCalled();
  });

  it('goes on its own on opening the app with something waiting', async () => {
    held.getQueueSize.mockResolvedValue(2);

    await renderHook(() => useOfflineQueue());

    await waitFor(() => expect(held.processQueue).toHaveBeenCalled());
  });

  it('stays quiet on opening the app with nothing waiting', async () => {
    held.getQueueSize.mockResolvedValue(0);

    await renderHook(() => useOfflineQueue());

    await waitFor(() => expect(held.getQueueSize).toHaveBeenCalled());
    expect(held.processQueue).not.toHaveBeenCalled();
  });

  it('says while it is working, and stops saying so afterwards', async () => {
    held.getQueueSize.mockResolvedValue(1);
    let finish!: (count: number) => void;
    held.processQueue.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = await renderHook(() => useOfflineQueue());

    await waitFor(() => expect(result.current.isProcessing).toBe(true));

    await act(async () => {
      finish(1);
    });

    await waitFor(() => expect(result.current.isProcessing).toBe(false));
  });

  // Two flushes at once would send the same register twice.
  it('will not start a second send on top of one already running', async () => {
    held.getQueueSize.mockResolvedValue(1);
    let finish!: (count: number) => void;
    held.processQueue.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = await renderHook(() => useOfflineQueue());
    await waitFor(() => expect(result.current.isProcessing).toBe(true));

    await act(async () => {
      await expect(result.current.processNow()).resolves.toBe(0);
      finish(1);
    });

    expect(held.processQueue).toHaveBeenCalledTimes(1);
  });

  it('stops watching the app when the screen goes', async () => {
    const remove = jest.fn();
    (AppState.addEventListener as jest.Mock).mockReturnValue({ remove });

    const { unmount } = await renderHook(() => useOfflineQueue());
    await unmount();

    expect(remove).toHaveBeenCalled();
  });

  it('hands the screen the test for a lost connection', async () => {
    const { result } = await renderHook(() => useOfflineQueue());

    expect(result.current.isNetworkError).toBe(queue.isNetworkError);
  });
});
