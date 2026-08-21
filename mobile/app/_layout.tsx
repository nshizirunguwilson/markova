import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toaster } from 'sonner-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/auth-store';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { setupGlobalErrorHandling, errorReporter } from '@/lib/error-reporting';
import { DesignProvider } from '@/design';

setupGlobalErrorHandling();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
});

export default function RootLayout() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isLoading = useAuthStore((s) => s.isLoading);
  const userId = useAuthStore((s) => s.user?.id);
  usePushNotifications();

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    errorReporter.setUser(userId ?? null);
  }, [userId]);

  if (isLoading) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            {/*
              DesignProvider sits inside the query client because it fetches the
              school's branding, and outside everything that draws, because
              nothing should paint before the typeface has resolved. It also
              owns the splash screen now, which is why that call left this file.
            */}
            <DesignProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
                <Stack.Screen name="blocked" options={{ animation: 'fade' }} />
              </Stack>
              <Toaster position="top-center" />
            </DesignProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
