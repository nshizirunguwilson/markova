import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { AtSign, Lock } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { getErrorMessage } from '@/hooks/useQueryError';
import { useAuthStore, isValidIdentifier } from '@/stores/auth-store';
import { Button, Input } from '@/components/ui';
import { AuthShell } from '@/components/AuthShell';
import { colors, fontSize, spacing, fontFamily } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!identifier.trim()) newErrors.identifier = 'Email or phone is required';
    else if (!isValidIdentifier(identifier))
      newErrors.identifier = 'Enter a valid email address or phone number';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await login(identifier.trim(), password);
      if (result.needsOtp) {
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { identifier: identifier.trim() },
        });
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (error) {
      // Distinguishes an unreachable API from a rejected password. Reporting a
      // connection failure as "check your credentials" sends people hunting for
      // a problem that is not theirs.
      toast.error(getErrorMessage(error, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
        <View>
          <Input
            label="Email or Phone"
            placeholder="Email or phone number"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="username"
            error={errors.identifier}
            leftIcon={<AtSign size={20} color={colors.muted} />}
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            error={errors.password}
            leftIcon={<Lock size={20} color={colors.muted} />}
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
          />

          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Link>
        </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgotLink: {
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  forgotText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
});
