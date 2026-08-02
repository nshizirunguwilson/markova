import { useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Circle } from 'lucide-react-native';
import { toast } from 'sonner-native';

import api from '@/lib/api';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Text, Field, Button } from '@/ui';

/**
 * Set a new password.
 *
 * This route did not exist on mobile. The web has it, so a reset email opened
 * on a phone dead-ended: the link pointed at a page the app could not show and
 * the app had no way to accept the token. The route now takes a `token` param,
 * so `markova://reset-password?token=…` lands here, and the field is still
 * editable for anyone typing the code in by hand.
 *
 * The rules are shown as a live checklist rather than as a sentence under the
 * field. The API rejects with a single long message listing every rule at
 * once, which tells a person what they got wrong only after they have already
 * got it wrong.
 */

const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One capital letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One small letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'One number', test: (v: string) => /\d/.test(v) },
  { label: 'One symbol', test: (v: string) => /[^A-Za-z\d]/.test(v) },
];

export default function ResetPassword() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ token?: string; password?: string; confirm?: string }>({});

  const met = RULES.map((rule) => rule.test(password));
  const allMet = met.every(Boolean);

  const submit = async () => {
    const next: typeof errors = {};
    if (!token.trim()) next.token = 'Paste the code from your email';
    if (!allMet) next.password = 'That password does not meet the rules yet';
    if (password !== confirm) next.confirm = 'These two do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token: token.trim(), newPassword: password });
      toast.success('Password changed. Sign in with the new one.');
      router.replace('/(auth)/login');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400 || status === 401) {
        setErrors({ token: 'That code has expired or has already been used' });
      } else {
        toast.error(err?.response?.data?.message ?? 'Could not change it just now');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentContainerStyle={{ paddingTop: space.huge, gap: space.xxl }}>
        <View style={{ gap: space.md }}>
          <Text variant="title1">Choose a new password</Text>
          <Text variant="body" tone="secondary" style={{ maxWidth: 420 }}>
            Make it something you have not used here before.
          </Text>
        </View>

        <View style={{ gap: space.lg }}>
          <Field
            label="Reset code"
            value={token}
            onChangeText={setToken}
            error={errors.token}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            placeholder="Paste it from the email"
          />

          <View style={{ gap: space.md }}>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />

            <View style={{ gap: space.xs, paddingLeft: 2 }}>
              {RULES.map((rule, i) => (
                <View
                  key={rule.label}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                >
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

          <Field
            label="Type it again"
            value={confirm}
            onChangeText={setConfirm}
            error={errors.confirm}
            secureTextEntry
            autoCapitalize="none"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Button label="Change my password" kind="primary" block loading={busy} onPress={submit} />
          <View style={{ alignItems: 'center' }}>
            <Button
              label="Back to sign in"
              kind="quiet"
              onPress={() => router.replace('/(auth)/login')}
            />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
