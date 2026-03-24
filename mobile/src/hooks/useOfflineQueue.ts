import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import api from '@/lib/api';
import {
  getQueueSize,
  processQueue,
  enqueueAttendance,
  isNetworkError,
  type QueueItem,
} from '@/lib/offline-queue';

export function useOfflineQueue() {
  const [queueSize, setQueueSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const appState = useRef(AppState.currentState);

  const refreshSize = useCallback(async () => {
    const size = await getQueueSize();
    setQueueSize(size);
  }, []);

  const processNow = useCallback(async () => {
    const size = await getQueueSize();
    if (size === 0 || isProcessing) return 0;

    setIsProcessing(true);
    try {
      const processed = await processQueue(api);
      await refreshSize();
      return processed;
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, refreshSize]);

  const enqueue = useCallback(
    async (data: QueueItem['data']) => {
      const item = await enqueueAttendance(data);
      await refreshSize();
      return item;
    },
    [refreshSize],
  );

  // Auto-process when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        processNow();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [processNow]);

  // Load queue size and process on mount
  useEffect(() => {
    refreshSize().then(() => {
      getQueueSize().then((size) => {
        if (size > 0) processNow();
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    queueSize,
    isProcessing,
    processNow,
    enqueue,
    refreshSize,
    isNetworkError,
  };
}
