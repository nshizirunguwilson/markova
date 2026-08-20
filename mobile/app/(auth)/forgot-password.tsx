import { useState } from 'react';
import {
  View, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AtSign, Lock, ArrowLeft, Check } from 'lucide-react-native';
import { toast } from 'sonner-native';
import api from '@/lib/api';
import { buildLoginPayload } from '@/stores/auth-store';
import { Button, Input } from '@/components/ui';
import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/constants/theme';

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
    <AuthShell
      title={step === 'request' ? 'Reset your password' : 'Enter your code'}
      subtitle={
        step === 'request'
          ? "Enter your email or phone number and we'll send you a reset code."
          : `Enter the code sent to ${identifier} and choose a new password.`
      }
    >
        <View>
          {step === 'request' ? (
            <>
              <Input
                label="Email or Phone"
                placeholder="Email or phone number"
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
    </AuthShell>
  );
}

const styles = StyleSheet.create({
});
