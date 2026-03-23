import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { colors } from '@/constants/theme';

export default function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="child/[studentId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="child/attendance" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="child/marks" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="child/fees" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="child/discipline" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="child/homework" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="marks-entry" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="homework-manage" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="discipline-log" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="nfc-register" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="class-analytics" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="support" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="help" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="parent-teacher-chat" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="timetable" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="exam-schedule" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
