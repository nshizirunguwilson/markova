import { useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeIn } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { motion, radius, space } from '@/design/tokens';
import { Screen, Text, Field, Button } from '@/ui';

/**
 * The first thing anyone sees, and the only screen that has to work before the
 * app knows anything about who is looking at it.
 *
 * It wears the school. Name, motto and logo come from the public branding
 * endpoint, and the primary button is already in the school's own colour
 * before a single credential has been typed. A parent in Kigali should open
 * this and see their child's school, not a generic product.
 *
 * There is no illustration and no marketing copy. Someone opening this is
 * trying to get in.
 */

type Branding = { schoolName: string; schoolMotto: string; logoUrl: string };

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => (await api.get<Branding>('/school-config/public')).data,
    staleTime: 1000 * 60 * 60,
  });

  const validate = () => {
    const next: typeof errors = {};
    const value = identifier.trim();

    // Staff and parents sign in with either an email or a phone number, and
    // parents overwhelmingly use the phone. Demanding an email here, as the
    // previous version did, locked out the largest group of users.
    if (!value) next.identifier = 'Enter your email or phone number';
    else if (!/^\S+@\S+\.\S+$/.test(value) && !/^\+?\d[\d\s]{7,}$/.test(value))
      next.identifier = 'That does not look like an email or a phone number';

    if (!password) next.password = 'Enter your password';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const value = identifier.trim();
      const normalised = value.includes('@') ? value.toLowerCase() : value.replace(/\s/g, '');
      const result = await login(normalised, password);

      if (result.blocked) router.replace('/blocked');
      else if (result.needsOtp)
        router.push({ pathname: '/(auth)/verify-otp', params: { identifier: normalised } });
      else router.replace('/(app)/(tabs)');
    } catch (error: any) {
      const status = error?.response?.status;
      // The API distinguishes wrong credentials from a disabled account, and
      // so should the screen. "Login failed" for both tells nobody anything.
      const message =
        status === 401
          ? 'That email or password is not right.'
          : status === 403
            ? 'This account has been turned off. Ask your school administrator.'
            : (error?.response?.data?.message ??
              'Could not reach the school right now. Check your connection.');
      toast.error(message);
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
        <Animated.View entering={FadeIn.duration(motion.slow)} style={{ gap: space.md }}>
          {branding?.logoUrl ? (
            <Image
              source={{ uri: branding.logoUrl }}
              style={{ width: 56, height: 56, borderRadius: radius.md }}
              contentFit="contain"
              transition={200}
              accessibilityLabel={branding.schoolName}
            />
          ) : null}

          <View style={{ gap: space.xs, paddingTop: space.sm }}>
            <Text variant="title1">{branding?.schoolName ?? 'Markova'}</Text>
            {branding?.schoolMotto ? (
              <Text variant="callout" tone="secondary">
                {branding.schoolMotto}
              </Text>
            ) : null}
          </View>
        </Animated.View>

        <View style={{ gap: space.lg }}>
          <Field
            label="Email or phone"
            value={identifier}
            onChangeText={setIdentifier}
            error={errors.identifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            placeholder="you@school.edu or +250…"
          />

          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Button label="Sign in" kind="primary" block loading={busy} onPress={submit} />

          <View style={{ alignItems: 'center' }}>
            <Button
              label="I forgot my password"
              kind="quiet"
              onPress={() => router.push('/(auth)/forgot-password')}
            />
          </View>
        </View>

        <Text variant="footnote" tone="tertiary" align="center">
          Students sign in on the {branding?.schoolName ?? 'school'} website.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
