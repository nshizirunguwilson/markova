import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { toast } from 'sonner-native';
import { Check, Circle, Smartphone } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useSessions, useChangePassword } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Field, Button, LoadingRows } from '@/ui';

/**
 * Settings.
 *
 * Only three things belong here, so only three things are here: your password,
 * the devices you are signed in on, and the way out. The previous version also
 * carried notification toggles that were never wired to anything and a theme
 * switch for a theme that did not exist.
 *
 * The device list is the part worth having. Somebody who signed in on a shared
 * computer in a staff room should be able to see that and do something about
 * it, and the API has always exposed it.
 */

const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One capital letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One small letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'One number', test: (v: string) => /\d/.test(v) },
  { label: 'One symbol', test: (v: string) => /[^A-Za-z\d]/.test(v) },
];

export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { data: sessions, isPending } = useSessions();
  const change = useChangePassword();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const met = RULES.map((r) => r.test(next));
  const ready = current.length > 0 && met.every(Boolean);

  const submit = () => {
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success('Password changed');
          setOpen(false);
          setCurrent('');
          setNext('');
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? 'That did not work. Check the current password.'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Section title="Password">
          {open ? (
            <View style={{ gap: space.lg }}>
              <Field
                label="Current password"
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoCapitalize="none"
              />
              <View style={{ gap: space.md }}>
                <Field
                  label="New password"
                  value={next}
                  onChangeText={setNext}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <View style={{ gap: space.xs, paddingLeft: 2 }}>
                  {RULES.map((rule, i) => (
                    <View key={rule.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      {met[i] ? (
                        <Check size={14} color={t.status.positive.solid} strokeWidth={2.5} />
                      ) : (
                        <Circle size={14} color={t.fg.placeholder} strokeWidth={2} />
                      )}
                      <Text variant="footnote" tone={met[i] ? 'positive' : 'tertiary'}>
                        {rule.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Button
                  label="Change it"
                  kind="primary"
                  disabled={!ready}
                  loading={change.isPending}
                  onPress={submit}
                />
                <Button label="Cancel" kind="quiet" onPress={() => setOpen(false)} />
              </View>
            </View>
          ) : (
            <RowGroup>
              <Row title="Change your password" onPress={() => setOpen(true)} last />
            </RowGroup>
          )}
        </Section>

        <Section title="Where you are signed in">
          {isPending ? (
            <LoadingRows count={2} />
          ) : (
            <RowGroup>
              {(sessions ?? []).map((s, i, arr) => (
                <Row
                  key={s.id}
                  title={s.deviceInfo ?? 'Unknown device'}
                  subtitle={`${s.ipAddress ?? 'Unknown address'}   ·   since ${new Date(
                    s.createdAt,
                  ).toLocaleDateString()}`}
                  lead={<Smartphone size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
                  chevron={false}
                  last={i === arr.length - 1}
                />
              ))}
              {!sessions?.length ? (
                <Row title="Only this device" chevron={false} last />
              ) : null}
            </RowGroup>
          )}
          <Text variant="footnote" tone="tertiary">
            Signing out ends the session on this device only.
          </Text>
        </Section>

        <Section title="Leaving">
          <RowGroup>
            <Row
              title="Sign out"
              chevron={false}
              onPress={() => void logout().then(() => router.replace('/(auth)/login'))}
              last
            />
          </RowGroup>
        </Section>
      </Screen>
    </>
  );
}
