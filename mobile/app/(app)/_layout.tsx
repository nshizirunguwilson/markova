import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { type as typeScale } from '@/design/tokens';

/**
 * The authenticated stack.
 *
 * Headers are native and configured once, rather than being a navy bar
 * component pasted onto every screen the way the old app did it. That means
 * the back gesture, the platform back button and title truncation all behave
 * the way the operating system intends, and a screen only has to say what it
 * is called.
 *
 * Routes are not listed one by one any more either. File based routing already
 * knows they exist, and the old list was thirty lines saying "slide from
 * right" thirty times, which is the default.
 */
export default function AppLayout() {
  const t = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const blockedRole = useAuthStore((s) => s.blockedRole);

  if (blockedRole) return <Redirect href="/blocked" />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.bg.page },
        headerTintColor: t.brand.text,
        headerTitleStyle: {
          fontFamily: typeScale.title3.fontFamily,
          fontSize: 17,
          color: t.fg.primary,
        },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.bg.page },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
