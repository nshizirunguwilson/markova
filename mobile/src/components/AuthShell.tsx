import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Logo } from '@/components/Logo';
import { useBrandStore } from '@/stores/brand-store';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

interface AuthShellProps {
  /** Heading under the mark. Defaults to the school name. */
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * The frame every unauthenticated screen sits in.
 *
 * Deliberately the same composition as `AuthShell` on web: brand ground, white
 * card, logo mark, school name, one-line subtitle. The two used to invert each
 * other — web showed a white shield on navy inside a pale card while mobile
 * showed a blue letter on white against navy — so signing in looked like two
 * different products.
 */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const schoolName = useBrandStore((s) => s.schoolName);
  const primaryColor = useBrandStore((s) => s.primaryColor);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: primaryColor }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Logo size={56} />
            <Text style={[styles.title, { color: primaryColor }]}>
              {title ?? schoolName}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing['3xl'],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginTop: -spacing.md,
    fontFamily: fontFamily.regular,
  },
});
