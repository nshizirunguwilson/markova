import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AxiosInstance } from 'axios';

const QUEUE_KEY = 'markova:attendance-queue';

// Simple storage that works on both web and native
const queueStorage = {
  get: async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(QUEUE_KEY);
    }
    return SecureStore.getItemAsync(QUEUE_KEY);
  },
  set: async (value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(QUEUE_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(QUEUE_KEY, value);
  },
  del: async (): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(QUEUE_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(QUEUE_KEY);
  },
};

export interface QueueItem {
  id: string;
  data: {
    classSectionId: string;
    date: string;
    type: 'DAILY' | 'SUBJECT';
    subjectId?: string;
    records: { studentId: string; status: string; reasonCategory?: string }[];
  };
  createdAt: string;
  retryCount: number;
}

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// In-memory cache to avoid async reads on every call
let cachedQueue: QueueItem[] | null = null;

async function readQueue(): Promise<QueueItem[]> {
  if (cachedQueue !== null) return cachedQueue;
  const raw = await queueStorage.get();
  if (!raw) {
    cachedQueue = [];
    return [];
  }
  try {
    cachedQueue = JSON.parse(raw);
    return cachedQueue!;
  } catch {
    cachedQueue = [];
    return [];
  }
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  cachedQueue = items;
  if (items.length === 0) {
    await queueStorage.del();
  } else {
    await queueStorage.set(JSON.stringify(items));
  }
}

export async function enqueueAttendance(data: QueueItem['data']): Promise<QueueItem> {
  const item: QueueItem = {
    id: generateId(),
    data,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getQueuedItems(): Promise<QueueItem[]> {
  return readQueue();
}

export async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function removeQueueItem(id: string): Promise<void> {
  const queue = (await readQueue()).filter((item) => item.id !== id);
  await writeQueue(queue);
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
}

/**
 * Attempts to submit all queued items via the API.
 * Returns the number of successfully processed items.
 */
export async function processQueue(apiInstance: AxiosInstance): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  let successCount = 0;
  const remaining: QueueItem[] = [];

  for (const item of queue) {
    try {
      await apiInstance.post('/attendance/bulk', item.data);
      successCount++;
    } catch (err: any) {
      const isNetErr = !err.response;
      const isServerErr = err.response?.status >= 500;

      if (isNetErr || isServerErr) {
        remaining.push({ ...item, retryCount: item.retryCount + 1 });
      } else if (item.retryCount < 3) {
        remaining.push({ ...item, retryCount: item.retryCount + 1 });
      }
      // Otherwise discard — permanent failure
    }
  }

  await writeQueue(remaining);
  return successCount;
}

/**
 * Check if an error looks like a network/connectivity error.
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') return true;
  if (error.message === 'Network Error') return true;
  if (!error.response && error.isAxiosError) return true;
  return false;
}
