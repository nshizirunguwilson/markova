import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { toast } from 'sonner-native';
import { getErrorMessage } from '@/hooks/useQueryError';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui';
import { AuthShell } from '@/components/AuthShell';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    if (text.length > 1) {
      // Handle paste
      const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (index + i < OTP_LENGTH) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = text.replace(/\D/g, '');
    setOtp(newOtp);

    if (text && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      toast.error('Please enter the full 6-digit code');
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(code);
      router.replace('/(app)/(tabs)');
    } catch (error: any) {
      const message = getErrorMessage(error, 'Invalid OTP. Please try again.');
      toast.error(message);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await resendOtp();
      toast.info('A new code has been sent');
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Could not resend code'));
    }
  };

  return (
    <AuthShell title="Verify your code">
      <View>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to{'\n'}
          <Text style={styles.email}>{identifier}</Text>
        </Text>

        {/* OTP Inputs */}
        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputRefs.current[i] = ref; }}
              style={[styles.otpInput, digit ? styles.otpInputFilled : undefined]}
              value={digit}
              onChangeText={(text) => handleChange(text, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={i === 0 ? OTP_LENGTH : 1}
              selectTextOnFocus
            />
          ))}
        </View>

        {/* Verify Button */}
        <Button
          title="Verify"
          onPress={handleVerify}
          loading={loading}
          fullWidth
          size="lg"
        />

        {/* Resend */}
        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Didn't receive the code? </Text>
          {countdown > 0 ? (
            <Text style={styles.countdown}>Resend in {countdown}s</Text>
          ) : (
            <Pressable onPress={handleResend}>
              <Text style={styles.resendLink}>Resend</Text>
            </Pressable>
          )}
        </View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing['2xl'],
    fontFamily: fontFamily.regular,
  },
  email: {
    color: colors.foreground,
    fontFamily: fontFamily.semibold,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing['3xl'],
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
    textAlign: 'center',
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    color: colors.foreground,
    borderWidth: 2,
    borderColor: colors.borderInput,
  },
  otpInputFilled: {
    backgroundColor: colors.accentLight,
    borderColor: colors.primary,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  resendText: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontFamily: fontFamily.regular,
  },
  countdown: {
    fontSize: fontSize.sm,
    color: colors.foregroundMuted,
    fontFamily: fontFamily.regular,
  },
  resendLink: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
