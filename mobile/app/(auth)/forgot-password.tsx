import { useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AtSign, Lock, ArrowLeft, Check } from 'lucide-react-native';
import { toast } from 'sonner-native';
import api from '@/lib/api';
import { buildLoginPayload } from '@/stores/auth-store';
import { Button, Input } from '@/components/ui';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

type Step = 'request' | 'reset';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    if (!identifier.trim()) {
      toast.error('Enter your email address or phone number');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/request-reset', buildLoginPayload(identifier));
      toast.success('Reset code sent');
      setStep('reset');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!token.trim()) {
      toast.error('Please enter the reset code');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token: token.trim(),
        newPassword,
      });
      toast.success('Password reset successfully!');
      router.replace('/(auth)/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>M</Text>
          </View>
          <Text style={styles.title}>Markova</Text>
        </View>

        <View style={styles.form}>
          {step === 'request' ? (
            <>
              <Text style={styles.formTitle}>Forgot Password</Text>
              <Text style={styles.formSubtitle}>
                Enter your email address or phone number and we'll send you a reset code.
              </Text>
              <Input
                label="Email or Phone"
                placeholder="you@school.com"
                value={identifier}
                onChangeText={setIdentifier}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={<AtSign size={20} color={colors.muted} />}
              />
              <Button
                title="Send Reset Code"
                onPress={handleRequest}
                loading={loading}
                fullWidth
                size="lg"
              />
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Reset Password</Text>
              <Text style={styles.formSubtitle}>
                Enter the code sent to {identifier} and your new password.
              </Text>
              <Input
                label="Reset Code"
                placeholder="Enter the code you received"
                value={token}
                onChangeText={setToken}
                autoCapitalize="characters"
                leftIcon={<Check size={20} color={colors.muted} />}
              />
              <Input
                label="New Password"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                leftIcon={<Lock size={20} color={colors.muted} />}
              />
              <Input
                label="Confirm Password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                leftIcon={<Lock size={20} color={colors.muted} />}
              />
              <Button
                title="Reset Password"
                onPress={handleReset}
                loading={loading}
                fullWidth
                size="lg"
              />
            </>
          )}

          <Button
            title="Back to Sign In"
            onPress={() => router.back()}
            variant="ghost"
            fullWidth
            icon={<ArrowLeft size={18} color={colors.primary} />}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing['3xl'] },
  header: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logoContainer: {
    width: 60, height: 60, borderRadius: radius['2xl'], backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  logoText: { fontSize: 28, fontFamily: fontFamily.bold, color: colors.primary },
  title: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.white },
  form: {
    backgroundColor: colors.white, borderRadius: radius['2xl'], padding: spacing['3xl'],
    shadowColor: colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  formTitle: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.foreground, marginBottom: spacing.xs },
  formSubtitle: { fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing['2xl'], lineHeight: 20, fontFamily: fontFamily.regular },
});
