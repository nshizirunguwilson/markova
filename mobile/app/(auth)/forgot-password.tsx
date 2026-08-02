import { useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import api from '@/lib/api';
import { motion, space } from '@/design/tokens';
import { Screen, Text, Field, Button } from '@/ui';

/**
 * Ask for a reset.
 *
 * Takes an email or a phone number for the same reason the login screen does:
 * most parents on this system have a phone number on file and no email.
 *
 * The confirmation deliberately does not say whether the account exists. An
 * endpoint that answers "no such user" to an unauthenticated caller is an
 * account enumeration oracle, and the API is careful about this, so the screen
 * should not undo that by phrasing it differently.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    const value = identifier.trim();
    if (!value) {
      setError('Enter your email or phone number');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const credential = value.includes('@')
        ? { email: value.toLowerCase() }
        : { phone: value.replace(/\s/g, '') };
      await api.post('/auth/request-reset', credential);
      setSent(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not send that just now');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen contentContainerStyle={{ paddingTop: space.huge, gap: space.xxl }}>
        <Animated.View entering={FadeIn.duration(motion.base)} style={{ gap: space.md }}>
          <Text variant="title1">Check your messages</Text>
          <Text variant="body" tone="secondary" style={{ maxWidth: 420 }}>
            If {identifier.trim()} belongs to an account here, a reset code is on its way to it.
          </Text>
          <Text variant="callout" tone="tertiary" style={{ maxWidth: 420 }}>
            The code is good for a short while. If nothing arrives, check the spam folder before
            asking for another one.
          </Text>
        </Animated.View>

        <View style={{ gap: space.md }}>
          <Button
            label="I have a code"
            kind="primary"
            block
            onPress={() => router.replace('/(auth)/reset-password')}
          />
          <View style={{ alignItems: 'center' }}>
            <Button label="Back to sign in" kind="quiet" onPress={() => router.replace('/(auth)/login')} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentContainerStyle={{ paddingTop: space.huge, gap: space.xxl }}>
        <View style={{ gap: space.md }}>
          <Text variant="title1">Reset your password</Text>
          <Text variant="body" tone="secondary" style={{ maxWidth: 420 }}>
            Tell us how the school reaches you and we will send a code.
          </Text>
        </View>

        <View style={{ gap: space.lg }}>
          <Field
            label="Email or phone"
            value={identifier}
            onChangeText={setIdentifier}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="go"
            onSubmitEditing={submit}
            placeholder="you@school.edu or +250…"
          />
          <Button label="Send the code" kind="primary" block loading={busy} onPress={submit} />
          <View style={{ alignItems: 'center' }}>
            <Button label="Back to sign in" kind="quiet" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
