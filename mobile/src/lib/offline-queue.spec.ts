import * as SecureStore from 'expo-secure-store';

/**
 * The register taken where there is no signal.
 *
 * A teacher marking attendance in a classroom with no bars must still be able
 * to finish. The queue holds those submissions on the phone until the network
 * comes back. Two failures matter more than the rest: losing a register that
 * was taken, and submitting the same one twice.
 */

const secure = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Map<string, string>;
};

const QUEUE_KEY = 'markova:attendance-queue';

const register = (studentId = 'student-1') => ({
  classSectionId: 'section-1',
  date: '2026-08-24',
  type: 'DAILY' as const,
  records: [{ studentId, status: 'PRESENT' }],
});

// The module keeps an in-memory cache, so every test needs a fresh copy of it.
const load = () => {
  let mod!: typeof import('./offline-queue');
  jest.isolateModules(() => {
    mod = require('./offline-queue');
  });
  return mod;
};

beforeEach(() => {
  secure.__store.clear();
  jest.clearAllMocks();
});

describe('holding a register until the signal returns', () => {
  it('keeps what was taken', async () => {
    const q = load();
    await q.enqueueAttendance(register());

    await expect(q.getQueueSize()).resolves.toBe(1);
    expect(secure.setItemAsync).toHaveBeenCalledWith(
      QUEUE_KEY,
      expect.stringContaining('section-1'),
    );
  });

  it('stamps each entry so two of them are never confused', async () => {
    const q = load();
    const first = await q.enqueueAttendance(register('a'));
    const second = await q.enqueueAttendance(register('b'));

    expect(first.id).not.toBe(second.id);
    expect(first.retryCount).toBe(0);
    expect(Date.parse(first.createdAt)).not.toBeNaN();
  });

  it('survives the app being closed and reopened', async () => {
    const first = load();
    await first.enqueueAttendance(register());

    const reopened = load();
    const held = await reopened.getQueuedItems();
    expect(held).toHaveLength(1);
    expect(held[0].data.classSectionId).toBe('section-1');
  });

  // Corrupt storage must not take the app down with it. An empty register is
  // recoverable; a crash on launch is not.
  it('starts clean rather than crashing on unreadable storage', async () => {
    secure.__store.set(QUEUE_KEY, 'not json at all');

    const q = load();
    await expect(q.getQueuedItems()).resolves.toEqual([]);
  });

  it('has nothing queued on a fresh install', async () => {
    const q = load();
    await expect(q.getQueueSize()).resolves.toBe(0);
  });

  it('drops one entry and keeps the rest', async () => {
    const q = load();
    const first = await q.enqueueAttendance(register('a'));
    await q.enqueueAttendance(register('b'));

    await q.removeQueueItem(first.id);

    const left = await q.getQueuedItems();
    expect(left).toHaveLength(1);
    expect(left[0].data.records[0].studentId).toBe('b');
  });

  // An empty queue is deleted rather than stored as "[]", so a fresh install
  // and a fully-flushed one look the same.
  it('erases the store once the last entry goes', async () => {
    const q = load();
    await q.enqueueAttendance(register());
    await q.clearQueue();

    expect(secure.deleteItemAsync).toHaveBeenCalledWith(QUEUE_KEY);
    await expect(q.getQueueSize()).resolves.toBe(0);
  });
});

describe('flushing the queue when the signal comes back', () => {
  const apiWith = (post: jest.Mock) => ({ post }) as never;

  it('does nothing when there is nothing held', async () => {
    const q = load();
    const post = jest.fn();

    await expect(q.processQueue(apiWith(post))).resolves.toBe(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('submits each held register and forgets it', async () => {
    const q = load();
    await q.enqueueAttendance(register('a'));
    await q.enqueueAttendance(register('b'));

    const post = jest.fn().mockResolvedValue({ data: {} });
    await expect(q.processQueue(apiWith(post))).resolves.toBe(2);

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledWith(
      '/attendance/bulk',
      expect.objectContaining({ classSectionId: 'section-1' }),
    );
    await expect(q.getQueueSize()).resolves.toBe(0);
  });

  // Still no signal. The register has to stay on the phone.
  it('keeps a register the network could not carry', async () => {
    const q = load();
    await q.enqueueAttendance(register());

    const post = jest.fn().mockRejectedValue({ message: 'Network Error' });
    await expect(q.processQueue(apiWith(post))).resolves.toBe(0);

    const held = await q.getQueuedItems();
    expect(held).toHaveLength(1);
    expect(held[0].retryCount).toBe(1);
  });

  it('keeps one the server was too broken to accept', async () => {
    const q = load();
    await q.enqueueAttendance(register());

    const post = jest.fn().mockRejectedValue({ response: { status: 503 } });
    await q.processQueue(apiWith(post));

    await expect(q.getQueueSize()).resolves.toBe(1);
  });

  /**
   * A register the server rejects outright — a deleted class, a term that
   * closed — will be rejected again forever. Three attempts, then it goes,
   * because a queue that never empties blocks every later register behind it.
   */
  it('gives up on one the server keeps refusing', async () => {
    const q = load();
    await q.enqueueAttendance(register());

    const post = jest.fn().mockRejectedValue({ response: { status: 400 } });
    for (let attempt = 0; attempt < 3; attempt++) {
      await q.processQueue(apiWith(post));
      expect(await q.getQueueSize()).toBe(1);
    }
    await q.processQueue(apiWith(post));

    await expect(q.getQueueSize()).resolves.toBe(0);
  });

  it('lets the good ones through even when one fails', async () => {
    const q = load();
    await q.enqueueAttendance(register('a'));
    await q.enqueueAttendance(register('b'));

    const post = jest
      .fn()
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ message: 'Network Error' });

    await expect(q.processQueue(apiWith(post))).resolves.toBe(1);
    await expect(q.getQueueSize()).resolves.toBe(1);
  });
});

describe('telling a lost signal from a real refusal', () => {
  const { isNetworkError } = load();

  it.each([
    ['a dropped connection', { code: 'ERR_NETWORK' }],
    ['a request that timed out', { code: 'ECONNABORTED' }],
    ['axios saying so in words', { message: 'Network Error' }],
    ['an axios error with no reply at all', { isAxiosError: true }],
  ])('calls %s a network problem', (_label, error) => {
    expect(isNetworkError(error)).toBe(true);
  });

  it.each([
    ['nothing', null],
    ['a refusal from the server', { response: { status: 400 } }],
    ['a plain bug', new Error('undefined is not a function')],
  ])('does not call %s a network problem', (_label, error) => {
    expect(isNetworkError(error)).toBe(false);
  });
});

/**
 * The same app runs in a browser during a demo, where there is no keychain.
 * The queue has to work there too, or an offline register taken on the web
 * simply vanishes.
 */
describe('the same queue in a browser', () => {
  const { Platform } = require('react-native');
  const localStore = new Map<string, string>();

  beforeAll(() => {
    (globalThis as any).localStorage = {
      getItem: (k: string) => localStore.get(k) ?? null,
      setItem: (k: string, v: string) => localStore.set(k, v),
      removeItem: (k: string) => localStore.delete(k),
    };
  });

  beforeEach(() => {
    localStore.clear();
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('holds and returns a register without touching the keychain', async () => {
    const q = load();
    await q.enqueueAttendance(register());

    expect(secure.setItemAsync).not.toHaveBeenCalled();
    expect(localStore.get(QUEUE_KEY)).toContain('section-1');

    const reopened = load();
    await expect(reopened.getQueueSize()).resolves.toBe(1);
  });

  it('erases the browser copy when the queue empties', async () => {
    const q = load();
    await q.enqueueAttendance(register());
    await q.clearQueue();

    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
    expect(localStore.size).toBe(0);
  });
});
