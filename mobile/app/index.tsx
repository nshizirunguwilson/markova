import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const blockedRole = useAuthStore((s) => s.blockedRole);

  // A blocked sign in outranks the other two states. The password was right,
  // so dropping them back on the login screen would only invite them to try
  // the same thing again and fail the same way.
  if (blockedRole) return <Redirect href="/blocked" />;
  if (isAuthenticated) return <Redirect href="/(app)/(tabs)" />;
  return <Redirect href="/(auth)/login" />;
}
