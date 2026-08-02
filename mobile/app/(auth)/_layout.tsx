import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const blockedRole = useAuthStore((s) => s.blockedRole);

  // Checked before the authenticated redirect. A blocked sign in clears the
  // tokens, so without this the layout would bounce them straight back to
  // login and they would never see the screen explaining what happened.
  if (blockedRole) return <Redirect href="/blocked" />;
  if (isAuthenticated) return <Redirect href="/(app)/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
