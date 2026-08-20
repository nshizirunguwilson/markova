import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toaster } from 'sonner-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth-store';
import { useBrandStore } from '@/stores/brand-store';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { setupGlobalErrorHandling, errorReporter } from '@/lib/error-reporting';
import { colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();
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

  // The same family the web dashboard loads through next/font, so the two
  // clients read as one product. React Native cannot synthesise weights for a
  // custom family, hence all four cuts.
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const loadBrand = useBrandStore((s) => s.loadBrand);
  const primaryColor = useBrandStore((s) => s.primaryColor);

  useEffect(() => {
    checkAuth();
    // Public route — the school's name, colour and crest are needed on the
    // login screen, before anyone has signed in.
    loadBrand();
  }, []);

  useEffect(() => {
    // Hold the splash until auth is resolved AND the type is ready, so the app
    // never flashes a system-font frame. A font failure must not block boot.
    if (!isLoading && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, fontsLoaded, fontError]);

  useEffect(() => {
    errorReporter.setUser(userId ?? null);
  }, [userId]);

  if (isLoading || (!fontsLoaded && !fontError)) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" backgroundColor={primaryColor} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
            <Toaster position="top-center" />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
