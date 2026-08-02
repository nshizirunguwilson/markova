import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { curve, motion, radius, space, type as typeScale } from '@/design/tokens';
import { Screen, Text, Button } from '@/ui';

const LENGTH = 6;
// The API enforces a 30 second cooldown on resend. Showing 60, as the previous
// version did, made people wait twice as long as they had to.
const RESEND_AFTER = 30;

/**
 * The six digits.
 *
 * Separate boxes rather than one field, because a code arriving by email is
 * read in pairs and typed with pauses, and separate boxes let a person see
 * where they are without counting. They are set at title size because this is
 * typed by someone glancing between two apps.
 *
 * It submits itself on the sixth digit. Asking somebody to press a button
 * after typing the last character of a code they just read is asking them to
 * confirm something they already confirmed.
 */
export default function VerifyOtp() {
  const t = useTheme();
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier?: string }>();

  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(RESEND_AFTER);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [left]);

  const submit = async (code: string) => {
    setBusy(true);
    try {
      const result = await verifyOtp(code);
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (result?.blocked) router.replace('/blocked');
      else router.replace('/(app)/(tabs)');
    } catch (error: any) {
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
      toast.error(error?.response?.data?.message ?? 'That code is not right. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const setAt = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '');

    // Pasting the whole code into any box fills the row, which is what happens
    // when somebody copies it straight out of the email.
    if (value.length > 1) {
      const spread = value.slice(0, LENGTH).split('');
      const next: string[] = Array(LENGTH).fill('');
      spread.forEach((d, i) => {
        next[i] = d;
      });
      setDigits(next);
      if (spread.length === LENGTH) void submit(next.join(''));
      else inputs.current[spread.length]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = value;
    setDigits(next);

    if (value && index < LENGTH - 1) inputs.current[index + 1]?.focus();
    if (next.every(Boolean)) void submit(next.join(''));
  };

  const onBackspace = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
  };

  const resend = async () => {
    try {
      await resendOtp();
      setLeft(RESEND_AFTER);
      toast.success('A new code is on its way');
    } catch {
      toast.error('Could not send another code just yet');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentContainerStyle={{ paddingTop: space.huge, gap: space.xxl }}>
        <Animated.View entering={FadeIn.duration(motion.base)} style={{ gap: space.md }}>
          <Text variant="title1">Check your email</Text>
          <Text variant="body" tone="secondary" style={{ maxWidth: 400 }}>
            We sent a six digit code{identifier ? ` to ${identifier}` : ''}. It expires in five
            minutes.
          </Text>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(el) => {
                inputs.current[index] = el;
              }}
              value={digit}
              onChangeText={(v) => setAt(index, v)}
              onKeyPress={(e) => onBackspace(index, e.nativeEvent.key)}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={LENGTH}
              editable={!busy}
              autoFocus={index === 0}
              accessibilityLabel={`Digit ${index + 1} of ${LENGTH}`}
              style={[
                typeScale.title1,
                {
                  flex: 1,
                  height: 64,
                  textAlign: 'center',
                  color: t.fg.primary,
                  backgroundColor: t.bg.page,
                  borderWidth: digit ? 2 : 1,
                  borderColor: digit ? t.brand.solid : t.line.border,
                  borderRadius: radius.md,
                  ...curve,
                },
              ]}
            />
          ))}
        </View>

        <View style={{ alignItems: 'flex-start', gap: space.md }}>
          {left > 0 ? (
            <Text variant="footnote" tone="tertiary" numeric>
              You can ask for another code in {left}s
            </Text>
          ) : (
            <Button label="Send another code" kind="quiet" onPress={resend} />
          )}

          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text variant="footnote" tone="secondary">
              Use a different account
            </Text>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
